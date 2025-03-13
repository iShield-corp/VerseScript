import parser from "./parser.js";
//const parser = require("./parser.js");
class VerseScript {
  constructor(baseUrl = "") {
    this.globalScope = {};
    this.classes = {};
    this.jsClasses = {};
    this.decorators = {
      log: this.createLogDecorator(),
      deprecated: this.createDeprecatedDecorator(),
      memoize: this.createMemoizeDecorator()
    };
    this.jsFunctions = {
      print: (msg) => console.log(msg),
      add: (a, b) => a + b,
      toJson: (obj) => {
        const replacer = (key, value) => {
          if (key === 'constructor') {
            return undefined;
          }
          return value;
        };
        return JSON.stringify(obj, replacer);
      },
      parseJson: (str) => {
        const parsed = JSON.parse(str);
        if (typeof parsed === 'object' && parsed !== null) {
          delete parsed.constructor;
        }
        return parsed;
      },
      getStringLength: (str) => str.length,
      arrayPush: (arr, item) => {
        arr.push(item);
        return arr;
      },
      arrayPop: (arr) => arr.pop(),
    };
    this.currentScope = this.globalScope;
    this.currentThis = null;
    this.macros = {};
    this.modules = new Map();
    this.currentModule = null;
    this.moduleQueue = [];
    this.baseUrl = baseUrl;
  }

  addJsFunction(name, func) {
    if (typeof func !== "function") {
      throw new Error("Second argument must be a function");
    }
    this.jsFunctions[name] = func;
  }

  addDecorator(name, decorator) {
    this.decorators[name] = decorator;
  }

  createLogDecorator() {
    return {
      method: (target, name, descriptor) => {
        const original = descriptor.value;
        descriptor.value = function(...args) {
          console.log(`Calling ${name} with args:`, args);
          const result = original.apply(this, args);
          console.log(`${name} returned:`, result);
          return result;
        };
        return descriptor;
      }
    };
  }

  createDeprecatedDecorator() {
    return {
      method: (target, name, descriptor) => {
        const original = descriptor.value;
        descriptor.value = function(...args) {
          console.warn(`Warning: ${name} is deprecated`);
          return original.apply(this, args);
        };
        return descriptor;
      }
    };
  }

  createMemoizeDecorator() {
    return {
      method: (target, name, descriptor) => {
        const original = descriptor.value;
        const cache = new Map();
        
        descriptor.value = function(...args) {
          const key = JSON.stringify(args);
          if (cache.has(key)) {
            return cache.get(key);
          }
          const result = original.apply(this, args);
          cache.set(key, result);
          return result;
        };
        return descriptor;
      }
    };
  }



  addJsClass(name, jsClass) {
    if (
      typeof jsClass !== "function" ||
      typeof jsClass.prototype !== "object"
    ) {
      throw new Error("Second argument must be a class");
    }

    this.jsClasses[name] = class extends jsClass {
      constructor(...args) {
        super(...args);
        Object.getOwnPropertyNames(jsClass.prototype).forEach((key) => {
          if (key !== "constructor" && typeof this[key] === "function") {
            this[key] = this[key].bind(this);
          }
        });
      }
    };
  }

  async interpretMultiple(files) {
    this.moduleQueue = files.map((file) => ({
      filename: file,
      content: null,
    }));

    while (this.moduleQueue.length > 0) {
      const { filename } = this.moduleQueue.shift();
      await this.interpret(filename);
    }

    return this.modules.get(files[0]).exports;
  }

  async interpret(input, isFilename = false) {
    let content;
    let filename;

    if (isFilename) {
      filename = input;
      if (this.modules.has(filename)) {
        return this.modules.get(filename).exports;
      }
      content = await this.fetchModuleContent(filename);
    } else {
      content = input;
      filename = "inline-script";
    }

    const module = {
      exports: {},
      filename,
      loaded: false,
    };

    this.modules.set(filename, module);
    this.currentModule = module;

    try {
      const ast = parser.parse(content);
      for (const node of ast.body) {
        await this.evaluateNode(node);
      }
    } catch (error) {
      if (error.location) {
        const lines = content.split("\n");
        const line = lines[error.location.start.line - 1];
        const pointer = " ".repeat(error.location.start.column - 1) + "^";

        throw new Error(
          `${error.message}\nAt ${filename}:${error.location.start.line}:${error.location.start.column}\n${line}\n${pointer}`,
        );
      } else {
        throw error;
      }
    }

    module.loaded = true;
    this.currentModule = null;

    return module.exports;
  }

  async fetchModuleContent(filename) {
    const response = await fetch(this.baseUrl + filename);
    if (!response.ok) {
      throw new Error(`Failed to fetch module: ${filename}`);
    }
    return await response.text();
  }

  evaluateImport(node) {
    const sourceModule = this.loadModuleFile(node.source.value);
    for (const specifier of node.specifiers) {
      if (!(specifier.name.name in sourceModule.exports)) {
        throw new Error(
          `Module '${node.source.value}' does not export '${specifier.name.name}'`,
        );
      }
      this.currentScope[specifier.alias.name] =
        sourceModule.exports[specifier.name.name];
    }
  }

  evaluateExport(node) {
    if (node.declaration) {
      this.evaluateNode(node.declaration);
      if (node.declaration.type === "variableDeclaration") {
        this.currentModule.exports[node.declaration.id.name] =
          this.currentScope[node.declaration.id.name];
      } else if (
        node.declaration.type === "functionDefinition" ||
        node.declaration.type === "classDefinition"
      ) {
        this.currentModule.exports[node.declaration.name.name] =
          this.currentScope[node.declaration.name.name];
      }
    } else if (node.specifiers) {
      for (const specifier of node.specifiers) {
        this.currentModule.exports[specifier.alias.name] =
          this.currentScope[specifier.name.name];
      }
    }
  }

  async loadModuleFile(moduleName) {
    const extension = ".vs";
    const moduleFile = new URL(moduleName + extension, this.baseUrl).href;

    if (this.modules.has(moduleFile)) {
      return this.modules.get(moduleFile);
    }

    return await this.interpret(moduleFile, true);
  }

  async evaluateNode(node) {
    try {
      switch (node.type) {
        case "classDefinition":
          this.defineClass(node);
          break;
        case "variableDeclaration":
          const value = node.init ? await this.evaluateNode(node.init) : undefined;
          this.currentScope[node.id.name] = value;
          break;
        case "nullLiteral":
          return null;
        case "macroExpansion":
          return await this.expandMacro(node);
        case "functionDefinition":
          const func = async (...args) => {
            const previousScope = this.currentScope;
            this.currentScope = Object.create(this.currentScope);
            node.params.forEach((param, index) => {
              this.currentScope[param.name] = args[index];
            });
            try {
              const result = await this.evaluateBlock(node.body);
              return result;
            } catch (e) {
              if (e.type === "return") {
                return e.value;
              }
              throw e;
            } finally {
              this.currentScope = previousScope;
            }
          };
          this.currentScope[node.name.name] = func;
          break;
        case "ifStatement":
          if (await this.evaluateNode(node.test)) {
            await this.evaluateBlock(node.consequent);
          } else if (node.alternate) {
            await this.evaluateBlock(node.alternate);
          }
          break;
        case "tryCatchStatement":
          try {
            await this.evaluateBlock(node.tryBlock);
          } catch (error) {
            const previousScope = this.currentScope;
            this.currentScope = Object.create(this.currentScope);
            this.currentScope[node.errorParam.name] = error;
            try {
              await this.evaluateBlock(node.catchBlock);
            } finally {
              this.currentScope = previousScope;
            }
          }
          break;
        case "forLoop":
          await this.evaluateForLoop(node);
          break;
        case "whileLoop":
          while (await this.evaluateNode(node.test)) {
            await this.evaluateBlock(node.body);
          }
          break;
        case "returnStatement":
          this.returnValue = node.value ? await this.evaluateNode(node.value) : undefined;
          throw { type: "return", value: this.returnValue };
        case "assignment":
          return await this.evaluateAssignment(node);
        case "objectCreation":
          return await this.createObject(node);
        case "functionCall":
          return await this.callFunction(node);
        case "self":
          if (!this.currentThis) {
            throw new Error("'self' used outside of a class method");
          }
          return this.currentThis;
        case "memberExpression":
          return await this.evaluateMemberExpression(node);
        case "identifier":
          return this.resolveIdentifier(node);
        case "awaitExpression":
          const awaitedValue = await this.evaluateNode(node.argument);
          return awaitedValue;
        case "integer":
        case "float":
        case "string":
        case "boolean":
        case "char":
          return node.value;
        case "logicalOr":
          return await this.evaluateNode(node.left) || await this.evaluateNode(node.right);
        case "logicalAnd":
          return await this.evaluateNode(node.left) && await this.evaluateNode(node.right);
        case "equality":
          return this.evaluateEquality(node);
        case "comparison":
          return this.evaluateComparison(node);
        case "addition":
        case "multiplication":
          return this.evaluateBinaryOperation(node);
        case "unary":
          return this.evaluateUnaryOperation(node);
        case "macroDefinition":
          this.defineMacro(node);
          break;
        case "importDeclaration":
          await this.evaluateImport(node);
          break;
        case "exportDeclaration":
          await this.evaluateExport(node);
          break;
        case "arrayLiteral":
          return Promise.all(node.elements.map(element => this.evaluateNode(element)));
        case "expressionStatement":
          return await this.evaluateNode(node.expression);
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }
    } catch (error) {
      if (node.loc) {
        error.message = `${error.message}\nAt ${this.currentModule.filename}:${node.loc.start.line}:${node.loc.start.column}`;
      }
      throw error;
    }
  }

  defineClass(node) {
  // Initialize classInfo with default values
  let classInfo = {
    methods: {},
    properties: {},
    constructor: (instance, args) => {},
    parentClass: null
  };

  // Handle class inheritance
  if (node.superClass) {
    classInfo.parentClass = this.classes[node.superClass.name];
    if (!classInfo.parentClass) {
      throw new Error(`Superclass ${node.superClass.name} is not defined`);
    }
  }

  // Apply class decorators if present
  if (node.decorators && node.decorators.length > 0) {
    for (const decorator of node.decorators) {
      const decoratorFn = this.decorators[decorator.name.name];
      if (!decoratorFn) {
        throw new Error(`Unknown decorator: @${decorator.name.name}`);
      }
      if (decoratorFn.class) {
        classInfo = decoratorFn.class(classInfo);
      }
    }
  }

  // Process class members (methods and properties)
  for (const member of node.members) {
    const isPrivate = member.name.name.startsWith('_');

    if (member.type === "methodDefinition") {
      // Create basic method descriptor
      let descriptor = {
        value: this.createMethod(member, node.name.name).bind(this),
        writable: true,
        enumerable: true,
        configurable: true
      };

      // Apply method decorators if present
      if (member.decorators && member.decorators.length > 0) {
        for (const decorator of member.decorators) {
          const decoratorFn = this.decorators[decorator.name.name];
          if (!decoratorFn) {
            throw new Error(`Unknown decorator: @${decorator.name.name}`);
          }
          if (decoratorFn.method) {
            descriptor = decoratorFn.method(classInfo, member.name.name, descriptor);
          }
        }
      }

      // Store the method with its privacy flag
      classInfo.methods[member.name.name] = {
        method: descriptor.value,
        isPrivate
      };
    } else if (member.type === "propertyDefinition") {
      // Handle property definitions
      const value = member.value !== null ? this.evaluateNode(member.value) : undefined;
      classInfo.properties[member.name.name] = {
        value,
        isPrivate
      };
    }
  }

  // Handle constructor if defined
  if (node.constructor) {
    classInfo.constructor = this.createConstructor(node.constructor, node.name.name).bind(this);
  }

  // Store the class definition
  this.classes[node.name.name] = classInfo;

  // Create the constructor function for creating instances
  const classConstructor = (...args) => {
    const instance = Object.create(null);

    // Add constructor reference
    instance.constructor = { name: node.name.name };

    // Build prototype chain and add members
    let currentClass = this.classes[node.name.name];
    while (currentClass) {
      // Add methods from current class
      Object.entries(currentClass.methods).forEach(([name, methodInfo]) => {
        if (!methodInfo.isPrivate || this.currentThis === instance) {
          instance[name] = (...args) => methodInfo.method(instance, ...args);
        }
      });

      // Add properties from current class
      Object.entries(currentClass.properties).forEach(([name, propertyInfo]) => {
        if (!propertyInfo.isPrivate || this.currentThis === instance) {
          Object.defineProperty(instance, name, {
            value: propertyInfo.value,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      });

      // Move up the inheritance chain
      currentClass = currentClass.parentClass;
    }

    // Call the constructor
    const result = classInfo.constructor(instance, args);
    
    // Ensure instance properties are properly set
    if (result !== undefined) {
      Object.assign(instance, result);
    }

    return instance;
  };

  // Store constructor in global scope
  this.globalScope[node.name.name] = classConstructor;
}

createMethod(node, className) {
  return async (instance, ...args) => {
    const previousScope = this.currentScope;
    const previousThis = this.currentThis;
    this.currentScope = Object.create(this.globalScope);
    this.currentThis = instance;

    this.currentScope.self = instance;

    const classInfo = this.classes[className];
    if (classInfo && classInfo.parentClass) {
      this.currentScope.super = {};
      Object.entries(classInfo.parentClass.methods).forEach(([methodName, methodInfo]) => {
        if (!methodInfo.isPrivate) {
          this.currentScope.super[methodName] = async (...args) => {
            return await methodInfo.method(instance, ...args);
          };
        }
      });
    }

    node.params.forEach((param, index) => {
      this.currentScope[param.name] = args[index];
    });
    
    try {
      const result = await this.evaluateBlock(node.body);
      return result;
    } catch (e) {
      if (e.type === "return") {
        return e.value;
      }
      throw e;
    } finally {
      this.currentScope = previousScope;
      this.currentThis = previousThis;
    }
  };
}


  createConstructor(node, className) {
    return (instance, args) => {
      const previousScope = this.currentScope;
      const previousThis = this.currentThis;
      this.currentScope = Object.create(this.globalScope);
      this.currentThis = instance;
  
      // Add 'self' to the scope
      this.currentScope.self = instance;
  
      // Add 'super' to the scope
      const classInfo = this.classes[className];
      if (classInfo && classInfo.parentClass) {
        this.currentScope.super = (...superArgs) => {
          return classInfo.parentClass.constructor(instance, superArgs);
        };
      }
  
      node.params.forEach((param, index) => {
        this.currentScope[param.name] = args[index];
      });
      try {
        const result = this.evaluateBlock(node.body);
        // Ensure that the instance properties are set
        Object.assign(instance, this.currentScope.self);
        return result;
      } finally {
        this.currentScope = previousScope;
        this.currentThis = previousThis;
      }
    };
  }

  createObject(node) {
    if (this.classes[node.className.name]) {
      const classInfo = this.classes[node.className.name];
      const instance = Object.create(null);
      
      // Add constructor property
      instance.constructor = { name: node.className.name };
      
      // Set up the prototype chain
      let currentClass = classInfo;
      const prototypeChain = [];
      while (currentClass) {
        prototypeChain.unshift(currentClass);
        currentClass = currentClass.parentClass;
      }
      
      // Attach methods to the instance, including private methods
      prototypeChain.forEach(cls => {
        Object.entries(cls.methods).forEach(([name, methodInfo]) => {
          instance[name] = (...args) => methodInfo.method(instance, ...args);
        });
      });
  
      // Attach properties to the instance, including private properties
      prototypeChain.forEach(cls => {
        Object.entries(cls.properties).forEach(([name, propertyInfo]) => {
          instance[name] = propertyInfo.value;
        });
      });
  
      // Call only the constructor of the instantiated class
      const args = node.arguments.map((arg) => this.evaluateNode(arg));
      classInfo.constructor(instance, args);
  
      return instance;
    } else if (this.jsClasses[node.className.name]) {
      const JsClass = this.jsClasses[node.className.name];
      const instance = new JsClass(
        ...node.arguments.map((arg) => this.evaluateNode(arg)),
      );
      return instance;
    } else {
      console.error("Class not found:", node.className.name);
      throw new Error(`Unknown class: ${node.className.name}`);
    }
  }

  async callFunction(node) {
    let func;
    let thisArg = null;
  
    if (node.callee.type === "memberExpression") {
      const obj = await this.evaluateNode(node.callee.object);
      const prop = node.callee.property.name;
      try {
        func = await this.evaluateMemberExpression(node.callee);
      } catch (error) {
        console.error('Error accessing method:', error.message);
        throw error;
      }
      thisArg = obj;
    } else if (node.callee.type === "identifier") {
      func = await this.resolveIdentifier(node.callee);
    } else {
      func = await this.evaluateNode(node.callee);
    }
  
    if (typeof func !== "function") {
      console.error('Attempted to call non-function:', {
        callee: node.callee,
        evaluatedFunction: func
      });
      throw new Error(`${node.callee.name || "Expression"} is not a function`);
    }
  
    const args = await Promise.all(node.arguments.map(arg => this.evaluateNode(arg)));
    
    const previousThis = this.currentThis;
    this.currentThis = thisArg;
    try {
      const result = await func.apply(thisArg, args);
      return result;
    } catch (error) {
      console.error('Error during function call:', error);
      throw error;
    } finally {
      this.currentThis = previousThis;
    }
  }

  resolveIdentifier(node) {
    if (node.name in this.currentScope) {
      return this.currentScope[node.name];
    }
    if (this.currentThis && node.name in this.currentThis) {
      return this.currentThis[node.name];
    }
    if (node.name in this.globalScope) {
      return this.globalScope[node.name];
    }
    if (node.name in this.jsFunctions) {
      return this.jsFunctions[node.name];
    }
    if (node.name in this.jsClasses) {
      return this.jsClasses[node.name];
    }
    throw new Error(`Undefined variable: ${node.name}`);
  }

  async evaluateMemberExpression(node) {
    let obj;
    if (node.object.type === "self") {
      obj = this.currentThis;
    } else {
      obj = await this.evaluateNode(node.object);
    }
    
    const prop = node.computed ? await this.evaluateNode(node.property) : node.property.name;
    
    if (obj && typeof obj === 'object') {
      const className = obj.constructor ? obj.constructor.name : null;
      const classInfo = className ? this.classes[className] : null;
      if (classInfo) {
        const method = classInfo.methods[prop];
        const property = classInfo.properties[prop];
        
        if ((method && method.isPrivate) || (property && property.isPrivate)) {
          if (this.currentThis !== obj) {
            throw new Error(`Cannot access private member '${prop}'`);
          }
        }
      }
    }
    
    if (prop.startsWith('_') && this.currentThis !== obj) {
      throw new Error(`Cannot access private member '${prop}'`);
    }
    
    const result = obj[prop];
    return result;
  }



  evaluateAssignment(node) {
    const value = this.evaluateNode(node.right);
    if (node.left.type === "identifier") {
      this.currentScope[node.left.name] = value;
    } else if (node.left.type === "memberExpression") {
      const obj = this.evaluateNode(node.left.object);
      if (node.left.computed) {
        const prop = this.evaluateNode(node.left.property);
        obj[prop] = value;
      } else {
        obj[node.left.property.name] = value;
      }
    }
    return value;
  }

  async evaluateBlock(block) {
    for (const statement of block) {
      await this.evaluateNode(statement);
    }
  }

  async evaluateForLoop(node) {
    try {
      if (node.init) {
        await this.evaluateNode(node.init);
      }

      while (true) {
        if (node.test && !(await this.evaluateNode(node.test))) {
          break;
        }

        await this.evaluateBlock(node.body);

        if (node.update) {
          await this.evaluateNode(node.update);
        }
      }
    } finally {
      // Cleanup if needed
    }
  }

  createFunction(node) {
    return (...args) => {
      const previousScope = this.currentScope;
      this.currentScope = Object.create(this.currentScope);
      node.params.forEach((param, index) => {
        this.currentScope[param.name] = args[index];
      });
      try {
        this.evaluateBlock(node.body);
      } catch (e) {
        if (e.type === "return") {
          return e.value;
        }
        throw e;
      } finally {
        this.currentScope = previousScope;
      }
      return undefined;
    };
  }

  evaluateEquality(node) {
    const left = this.evaluateNode(node.left);
    const right = this.evaluateNode(node.right);
    switch (node.operator) {
      case "==":
        return left == right;
      case "!=":
        return left != right;
    }
  }

  /*expandMacro(node) {
    const macro = this.macros[node.name.name];
    if (!macro) {
      throw new Error(`Unknown macro: ${node.name.name}`);
    }
  
    let expandedBody = macro.body;
    macro.params.forEach((param, index) => {
      const argValue = this.evaluateNode(node.arguments[index]);
      const regex = new RegExp(`\\b${param.name}\\b`, "g");
      expandedBody = expandedBody.replace(regex, JSON.stringify(argValue));
    });
  
    return this.evaluateNode(parser.parse(expandedBody)[0]);
  }*/

  evaluateComparison(node) {
    const left = this.evaluateNode(node.left);
    const right = this.evaluateNode(node.right);
    switch (node.operator) {
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
    }
  }

  evaluateBinaryOperation(node) {
    const left = this.evaluateNode(node.left);
    const right = this.evaluateNode(node.right);
    switch (node.operator) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        return left / right;
      case "%":
        return left % right;
    }
  }

  evaluateUnaryOperation(node) {
    const operand = this.evaluateNode(node.right);
    switch (node.operator) {
      case "-":
        return -operand;
      case "!":
        return !operand;
      case "typeof":
        return typeof operand;
    }
  }

  defineMacro(node) {
    this.macros[node.name.name] = {
      params: node.params,
      body: node.body.trim(),
    };
  }

  expandMacro(node) {
    const macro = this.macros[node.name.name];
    if (!macro) {
      throw new Error(`Unknown macro: ${node.name.name}`);
    }

    let expandedBody = macro.body;
    macro.params.forEach((param, index) => {
      const argValue = this.evaluateNode(node.arguments[index]);
      const regex = new RegExp(`\\b${param.name}\\b`, "g");
      expandedBody = expandedBody.replace(regex, JSON.stringify(argValue));
    });


    try {
      const expandedAst = parser.parse(expandedBody, {
        startRule: "expression",
      });
      return this.evaluateNode(expandedAst);
    } catch (error) {
      console.error(`Error parsing expanded macro: ${error}`);
      throw error;
    }
  }
}
export default VerseScript;
//module.exports = VerseScript;

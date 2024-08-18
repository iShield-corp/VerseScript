import parser from "./parser.js";
//const parser = require("./parser.js");
class VerseScript {
  constructor(baseUrl = "") {
    this.globalScope = {};
    this.classes = {};
    this.jsClasses = {};
    this.jsFunctions = {
      print: (msg) => console.log(msg),
      add: (a, b) => a + b,
      toJson: (obj) => JSON.stringify(obj),
      parseJson: (str) => JSON.parse(str),
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

  interpret(input, isFilename = false) {
    let content;
    let filename;

    if (isFilename) {
      filename = input;
      if (this.modules.has(filename)) {
        return this.modules.get(filename).exports;
      }
      content = ""; // await this.fetchModuleContent(filename);
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
        this.evaluateNode(node);
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

  evaluateNode(node) {
    try {
      switch (node.type) {
        case "classDefinition":
          this.defineClass(node);
          break;
        case "variableDeclaration":
          const value = node.init ? this.evaluateNode(node.init) : undefined;
          this.currentScope[node.id.name] = value;
          break;
        case "macroExpansion":
          return this.expandMacro(node);
        case "functionDefinition":
          this.currentScope[node.name.name] = this.createFunction(node);
          break;
        case "ifStatement":
          if (this.evaluateNode(node.test)) {
            this.evaluateBlock(node.consequent);
          } else if (node.alternate) {
            this.evaluateBlock(node.alternate);
          }
          break;
        case "tryCatchStatement":
            try {
              this.evaluateBlock(node.tryBlock);
            } catch (error) {
              const previousScope = this.currentScope;
              this.currentScope = Object.create(this.currentScope);
              this.currentScope[node.errorParam.name] = error;
              try {
                this.evaluateBlock(node.catchBlock);
              } finally {
                this.currentScope = previousScope;
              }
            }
            break;
        case "forLoop":
          this.evaluateForLoop(node);
          break;
        case "whileLoop":
          while (this.evaluateNode(node.test)) {
            //console.log(node.test);
            //console.log('Current Scope: ', this.currentScope);
            //console.log('Global Scope: ', this.globalScope);
            //console.log('Current This: ', this.currentThis);
            this.evaluateBlock(node.body);
          }
          break;
        case "returnStatement":
          this.returnValue = node.value
            ? this.evaluateNode(node.value)
            : undefined;
          throw { type: "return", value: this.returnValue };
        case "assignment":
          return this.evaluateAssignment(node);
        case "objectCreation":
          return this.createObject(node);
        case "functionCall":
          return this.callFunction(node);
        case "self":
          if (!this.currentThis) {
            throw new Error("'self' used outside of a class method");
          }
          return this.currentThis;
        case "memberExpression":
          return this.evaluateMemberExpression(node);
        case "identifier":
          return this.resolveIdentifier(node);
        case "integer":
        case "float":
        case "string":
        case "boolean":
        case "char":
          return node.value;
        case "logicalOr":
          return this.evaluateNode(node.left) || this.evaluateNode(node.right);
        case "logicalAnd":
          return this.evaluateNode(node.left) && this.evaluateNode(node.right);
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
        case "macroExpansion":
          return this.expandMacro(node);
        case "importDeclaration":
          this.evaluateImport(node);
          break;
        case "exportDeclaration":
          this.evaluateExport(node);
          break;
        case "arrayLiteral":
          return node.elements.map(element => this.evaluateNode(element));
        case "expressionStatement":
          return this.evaluateNode(node.expression);
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
    const methods = {};
    const properties = {};
    let constructor = (instance, args) => {};
  
    for (const member of node.members) {
      const isPrivate = member.name.name.startsWith('_');
      if (member.type === "methodDefinition") {
        methods[member.name.name] = {
          method: this.createMethod(member, node.name.name).bind(this),
          isPrivate
        };
      } else if (member.type === "propertyDefinition") {
        properties[member.name.name] = {
          value: member.value !== null ? this.evaluateNode(member.value) : undefined,
          isPrivate
        };
      }
    }
  
    if (node.constructor) {
      constructor = this.createConstructor(node.constructor, node.name.name).bind(this);
    }
  
    let parentClass = null;
    if (node.superClass) {
      parentClass = this.classes[node.superClass.name];
      if (!parentClass) {
        throw new Error(`Superclass ${node.superClass.name} is not defined`);
      }
    }
  
    this.classes[node.name.name] = {
      methods,
      properties,
      constructor,
      parentClass
    };
  
    // Create a constructor function for the class
    const classConstructor = (...args) => {
      const instance = Object.create(null);
  
      // Set up the prototype chain
      let currentClass = this.classes[node.name.name];
      while (currentClass) {
        Object.entries(currentClass.methods).forEach(([name, methodInfo]) => {
          if (!methodInfo.isPrivate) {
            instance[name] = (...args) => methodInfo.method(instance, ...args);
          }
        });
        Object.entries(currentClass.properties).forEach(([name, propertyInfo]) => {
          if (!propertyInfo.isPrivate) {
            Object.defineProperty(instance, name, {
              value: propertyInfo.value,
              writable: true,
              enumerable: true,
              configurable: true
            });
          }
        });
        currentClass = currentClass.parentClass;
      }
  
      // Call the constructor
      constructor(instance, args);
  
      return instance;
    };
  
    // Store the constructor function in the global scope
    this.globalScope[node.name.name] = classConstructor;
  }

  createMethod(node, className) {
    return (instance, ...args) => {
      console.log(`Entering method ${node.name.name} of class ${className}`, {
        instance,
        args
      });
  
      const previousScope = this.currentScope;
      const previousThis = this.currentThis;
      this.currentScope = Object.create(this.globalScope);
      this.currentThis = instance;
  
      // Add 'self' to the scope
      this.currentScope.self = instance;
  
      // Add 'super' to the scope
      const classInfo = this.classes[className];
      if (classInfo && classInfo.parentClass) {
        this.currentScope.super = {};
        Object.entries(classInfo.parentClass.methods).forEach(([methodName, methodInfo]) => {
          if (!methodInfo.isPrivate) {
            this.currentScope.super[methodName] = (...args) => {
              console.log(`Calling super method ${methodName}`, { args });
              return methodInfo.method(instance, ...args);
            };
          }
        });
      }
  
      node.params.forEach((param, index) => {
        this.currentScope[param.name] = args[index];
      });
      
      try {
        const result = this.evaluateBlock(node.body);
        console.log(`Exiting method ${node.name.name} of class ${className}`, { result });
        return result;
      } catch (e) {
        if (e.type === "return") {
          console.log(`Returning from method ${node.name.name} of class ${className}`, { returnValue: e.value });
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

  callFunction(node) {
    let func;
    let thisArg = null;
  
    if (node.callee.type === "memberExpression") {
      const obj = this.evaluateNode(node.callee.object);
      const prop = node.callee.property.name;
      try {
        func = this.evaluateMemberExpression(node.callee);
      } catch (error) {
        console.error('Error accessing method:', error.message);
        throw error;
      }
      thisArg = obj;
      
      console.log('Calling member function:', {
        objectType: typeof obj,
        object: obj,
        property: prop,
        function: func
      });
    } else if (node.callee.type === "identifier") {
      func = this.resolveIdentifier(node.callee);
      console.log('Calling identifier function:', {
        identifier: node.callee.name,
        function: func
      });
    } else {
      func = this.evaluateNode(node.callee);
      console.log('Calling evaluated function:', {
        evaluatedFunction: func
      });
    }
  
    if (typeof func !== "function") {
      console.error('Attempted to call non-function:', {
        callee: node.callee,
        evaluatedFunction: func
      });
      throw new Error(`${node.callee.name || "Expression"} is not a function`);
    }
  
    const args = node.arguments.map(arg => this.evaluateNode(arg));
    console.log('Function arguments:', args);
  
    const previousThis = this.currentThis;
    this.currentThis = thisArg;
    try {
      const result = func.apply(thisArg, args);
      console.log('Function call result:', result);
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

  evaluateMemberExpression(node) {
    let obj;
    if (node.object.type === "self") {
      obj = this.currentThis;
    } else {
      obj = this.evaluateNode(node.object);
    }
    
    const prop = node.computed ? this.evaluateNode(node.property) : node.property.name;
    
    // Check if we're accessing a class member
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
    
    return obj[prop];
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

  evaluateBlock(block) {
    //const previousScope = this.currentScope;
    //this.currentScope = Object.create(this.currentScope);
    try {
      for (const statement of block) {
        this.evaluateNode(statement);
      }
    } finally {
      //this.currentScope = previousScope;
    }
  }

  evaluateForLoop(node) {
    //const previousScope = this.currentScope;
    //this.currentScope = Object.create(this.currentScope);

    try {
      // Initialize
      if (node.init) {
        this.evaluateNode(node.init);
      }

      // Test and loop
      while (true) {
        // Check the test condition if it exists
        if (node.test && !this.evaluateNode(node.test)) {
          break;
        }

        // Execute the loop body
        this.evaluateBlock(node.body);

        // Perform the update
        if (node.update) {
          this.evaluateNode(node.update);
        }
      }
    } finally {
      //this.currentScope = previousScope;
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

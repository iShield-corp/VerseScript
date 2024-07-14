import parser from "./parser.js";

class VerseScript {
  constructor(baseUrl = '') {
    this.globalScope = {};
    this.classes = {};
    this.jsClasses = {};
    this.jsFunctions = {
      print: (msg) => console.log(msg),
      add: (a, b) => a + b,
      toJson: (obj) => JSON.stringify(obj),
      parseJson: (str) => JSON.parse(str),
      getStringLength: (str) => str.length,
      arrayPush: (arr, item) => { arr.push(item); return arr; },
      arrayPop: (arr) => arr.pop()
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
    if (typeof func !== 'function') {
      throw new Error('Second argument must be a function');
    }
    this.jsFunctions[name] = func;
  }

  addJsClass(name, jsClass) {
    console.log(`Adding JS class: ${name}`);
    if (typeof jsClass !== 'function' || typeof jsClass.prototype !== 'object') {
      throw new Error('Second argument must be a class');
    }
    
    this.jsClasses[name] = class extends jsClass {
      constructor(...args) {
        console.log(`Constructing ${name} with args:`, args);
        super(...args);
        Object.getOwnPropertyNames(jsClass.prototype).forEach(key => {
          if (key !== 'constructor' && typeof this[key] === 'function') {
            this[key] = this[key].bind(this);
          }
        });
        console.log(`${name} instance created:`, this);
      }
    };
    console.log(`JS class ${name} added successfully`);
  }

  async interpretMultiple(files) {
    this.moduleQueue = files.map(file => ({
      filename: file,
      content: null
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
      content = '';//await this.fetchModuleContent(filename);
    } else {
      content = input;
      filename = 'inline-script';
    }

    const module = {
      exports: {},
      filename,
      loaded: false,
    };

    this.modules.set(filename, module);
    this.currentModule = module;

    const ast = parser.parse(content);
    console.log('ast:', ast);
    for (const node of ast) {
      this.evaluateNode(node);
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
        throw new Error(`Module '${node.source.value}' does not export '${specifier.name.name}'`);
      }
      this.currentScope[specifier.alias.name] = sourceModule.exports[specifier.name.name];
    }
  }

  evaluateExport(node) {
    if (node.declaration) {
      this.evaluateNode(node.declaration);
      if (node.declaration.type === 'variableDeclaration') {
        this.currentModule.exports[node.declaration.id.name] = this.currentScope[node.declaration.id.name];
      } else if (node.declaration.type === 'functionDefinition' || node.declaration.type === 'classDefinition') {
        this.currentModule.exports[node.declaration.name.name] = this.currentScope[node.declaration.name.name];
      }
    } else if (node.specifiers) {
      for (const specifier of node.specifiers) {
        this.currentModule.exports[specifier.alias.name] = this.currentScope[specifier.name.name];
      }
    }
  }

  async loadModuleFile(moduleName) {
    const extension = '.vs';
    const moduleFile = new URL(moduleName + extension, this.baseUrl).href;
    
    if (this.modules.has(moduleFile)) {
      return this.modules.get(moduleFile);
    }

    return await this.interpret(moduleFile, true);
  }

  evaluateNode(node) {
    switch (node.type) {
      case 'classDefinition':
        this.defineClass(node);
        break;
      case 'variableDeclaration':
        this.currentScope[node.id.name] = node.init ? this.evaluateNode(node.init) : undefined;
        break;
      case 'functionDefinition':
        this.currentScope[node.name.name] = this.createFunction(node);
        break;
      case 'ifStatement':
        if (this.evaluateNode(node.test)) {
          this.evaluateBlock(node.consequent);
        } else if (node.alternate) {
          this.evaluateBlock(node.alternate);
        }
        break;
      case 'forLoop':
        this.evaluateForLoop(node);
        break;
      case 'whileLoop':
        while (this.evaluateNode(node.test)) {
          this.evaluateBlock(node.body);
        }
        break;
      case 'returnStatement':
        throw { type: 'return', value: node.value ? this.evaluateNode(node.value) : undefined };
      case 'assignment':
        return this.evaluateAssignment(node);
      case 'objectCreation':
        return this.createObject(node);
      case 'functionCall':
        return this.callFunction(node);
      case 'memberExpression':
        return this.evaluateMemberExpression(node);
      case 'identifier':
        return this.resolveIdentifier(node);
      case 'integer':
      case 'float':
      case 'string':
      case 'boolean':
      case 'char':
        return node.value;
      case 'logicalOr':
        return this.evaluateNode(node.left) || this.evaluateNode(node.right);
      case 'logicalAnd':
        return this.evaluateNode(node.left) && this.evaluateNode(node.right);
      case 'equality':
        return this.evaluateEquality(node);
      case 'comparison':
        return this.evaluateComparison(node);
      case 'addition':
      case 'multiplication':
        return this.evaluateBinaryOperation(node);
      case 'unary':
        return this.evaluateUnaryOperation(node);
      case 'macroDefinition':
        this.defineMacro(node);
        break;
      case 'macroExpansion':
        return this.expandMacro(node);
      case 'importDeclaration':
        this.evaluateImport(node);
        break;
      case 'exportDeclaration':
        this.evaluateExport(node);
        break;
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  defineClass(node) {
    const methods = {};
    let constructor = (instance, args) => {};
    
    for (const member of node.members) {
      if (member.type === 'methodDefinition') {
        methods[member.name.name] = this.createMethod(member);
      }
    }

    if (node.constructor) {
      constructor = this.createConstructor(node.constructor);
    }

    this.classes[node.name.name] = { methods, constructor };
  }

  createMethod(node) {
    return (...args) => {
      const previousScope = this.currentScope;
      const previousThis = this.currentThis;
      this.currentScope = Object.create(this.currentScope);
      node.params.forEach((param, index) => {
        this.currentScope[param.name] = args[index];
      });
      try {
        return this.evaluateBlock(node.body);
      } finally {
        this.currentScope = previousScope;
        this.currentThis = previousThis;
      }
    };
  }

  createConstructor(node) {
    return (instance, args) => {
      const previousScope = this.currentScope;
      const previousThis = this.currentThis;
      this.currentScope = Object.create(this.currentScope);
      this.currentThis = instance;
      node.params.forEach((param, index) => {
        this.currentScope[param.name] = args[index];
      });
      try {
        this.evaluateBlock(node.body);
      } finally {
        this.currentScope = previousScope;
        this.currentThis = previousThis;
      }
    };
  }

  createObject(node) {
    console.log('Creating object:', node.className.name);
    console.log('Available classes:', Object.keys(this.classes), Object.keys(this.jsClasses));
    if (this.classes[node.className.name]) {
      const classInfo = this.classes[node.className.name];
      const instance = Object.create(classInfo.methods);
      classInfo.constructor(instance, node.arguments.map(arg => this.evaluateNode(arg)));
      console.log('Created instance from custom class:', instance);
      return instance;
    } else if (this.jsClasses[node.className.name]) {
      const JsClass = this.jsClasses[node.className.name];
      console.log('JS Class found:', JsClass);
      const instance = new JsClass(...node.arguments.map(arg => this.evaluateNode(arg)));
      console.log('Created instance from JS class:', instance);
      return instance;
    } else {
      console.error('Class not found:', node.className.name);
      throw new Error(`Unknown class: ${node.className.name}`);
    }
  }

  callFunction(node) {
    let func;
    let thisArg = null;
    
    if (node.callee.type === 'memberExpression') {
      const obj = this.evaluateNode(node.callee.object);
      const prop = node.callee.property.name;
      func = obj[prop];
      thisArg = obj;

    } else {
      func = this.evaluateNode(node.callee);
    }

    if (typeof func !== 'function') {
      console.error('Attempted to call:', func);
      console.error('Callee:', node.callee);
      throw new Error(`${node.callee.name || 'Expression'} is not a function`);
    }

    const args = node.arguments.map(arg => this.evaluateNode(arg));
    return func.apply(thisArg, args);
  }

  async evaluateMemberExpression(node) {
    console.log('Evaluating member expression:', node);
    const obj = await this.evaluateNode(node.object);
    console.log('Object:', obj);
    if (node.computed) {
      const prop = await this.evaluateNode(node.property);
      console.log('Computed property:', prop);
      return obj[prop];
    } else {
      console.log('Property:', node.property.name);
      console.log('Object properties:', Object.keys(obj));
      return obj[node.property.name];
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

  evaluateAssignment(node) {
    const value = this.evaluateNode(node.right);
    if (node.left.type === 'identifier') {
      this.currentScope[node.left.name] = value;
    } else if (node.left.type === 'memberExpression') {
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
    const previousScope = this.currentScope;
    this.currentScope = Object.create(this.currentScope);
    try {
      let result;
      for (const statement of block) {
        result = this.evaluateNode(statement);
      }
      return result;
    } catch (e) {
      if (e.type === 'return') return e.value;
      throw e;
    } finally {
      this.currentScope = previousScope;
    }
  }

  evaluateForLoop(node) {
    const previousScope = this.currentScope;
    this.currentScope = Object.create(this.currentScope);
    try {
      for (
        node.init ? this.evaluateNode(node.init) : null;
        node.test ? this.evaluateNode(node.test) : true;
        node.update ? this.evaluateNode(node.update) : null
      ) {
        this.evaluateBlock(node.body);
      }
    } finally {
      this.currentScope = previousScope;
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
        return this.evaluateBlock(node.body);
      } finally {
        this.currentScope = previousScope;
      }
    };
  }

  evaluateEquality(node) {
    const left = this.evaluateNode(node.left);
    const right = this.evaluateNode(node.right);
    switch (node.operator) {
      case '==': return left == right;
      case '!=': return left != right;
    }
  }

  evaluateComparison(node) {
    const left = this.evaluateNode(node.left);
    const right = this.evaluateNode(node.right);
    switch (node.operator) {
      case '<': return left < right;
      case '<=': return left <= right;
      case '>': return left > right;
      case '>=': return left >= right;
    }
  }

  evaluateBinaryOperation(node) {
    const left = this.evaluateNode(node.left);
    const right = this.evaluateNode(node.right);
    switch (node.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
    }
  }

  evaluateUnaryOperation(node) {
    const operand = this.evaluateNode(node.right);
    switch (node.operator) {
      case '-': return -operand;
      case '!': return !operand;
      case 'typeof': return typeof operand;
    }
  }

  defineMacro(node) {
    this.macros[node.name.name] = { params: node.params, body: node.body };
  }

  expandMacro(node) {
    const macro = this.macros[node.name.name];
    if (!macro) {
      throw new Error(`Unknown macro: ${node.name.name}`);
    }

    let expandedBody = macro.body;
    macro.params.forEach((param, index) => {
      const argValue = this.evaluateNode(node.arguments[index]);
      const regex = new RegExp(`\\b${param.name}\\b`, 'g');
      expandedBody = expandedBody.replace(regex, JSON.stringify(argValue));
    });

    return this.evaluateNode(parser.parse(expandedBody)[0]);
  }
}

export default VerseScript;
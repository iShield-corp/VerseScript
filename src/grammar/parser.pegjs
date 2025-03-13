{
  var locationInfo = function(location, type, node) {
    node.loc = location;
    return node;
  }
}

start
  = _ program:moduleItem* _ {
    return locationInfo(location(), "Program", { type: "Program", body: program });
  }

moduleItem
  = importDeclaration
  / exportDeclaration
  / statement

importDeclaration
  = "import" __ "{" _ importSpecifiers:importSpecifier* _ "}" __ "from" __ source:string _ ";" _ {
      return locationInfo(location(), "ImportDeclaration", { type: "importDeclaration", specifiers: importSpecifiers, source });
    }

importSpecifier
  = name:identifier __ ("as" __ alias:identifier)? {
      return locationInfo(location(), "ImportSpecifier", { type: "importSpecifier", name, alias: alias || name });
    }

exportDeclaration
  = "export" __ declaration:(variableDeclaration / functionDefinition / classDefinition) {
      return locationInfo(location(), "ExportDeclaration", { type: "exportDeclaration", declaration });
    }
  / "export" __ "{" _ exportSpecifiers:exportSpecifier* _ "}" _ ";" _ {
      return locationInfo(location(), "ExportDeclaration", { type: "exportDeclaration", specifiers: exportSpecifiers });
    }

exportSpecifier
  = name:identifier __ ("as" __ alias:identifier)? {
      return locationInfo(location(), "ExportSpecifier", { type: "exportSpecifier", name, alias: alias || name });
    }

statement
  = tryCatchStatement
  / macroDefinition
  / variableDeclaration
  / expressionStatement
  / ifStatement
  / forLoop
  / whileLoop
  / returnStatement
  / functionDefinition
  / classDefinition
  / macroExpansionStatement

tryCatchStatement
  = "try" _ tryBlock:block _ 
    "catch" _ "(" _ errorParam:identifier _ ")" _ catchBlock:block {
      return locationInfo(location(), "TryCatchStatement", { 
        type: "tryCatchStatement", 
        tryBlock, 
        catchBlock,
        errorParam 
      });
    }

macroExpansionStatement
  = expansion:macroExpansion _ ";" _ {
      return locationInfo(location(), "ExpressionStatement", { type: "expressionStatement", expression: expansion });
    }

expressionStatement
  = expr:expression _ ";" _ { 
      return locationInfo(location(), "ExpressionStatement", { 
        type: "expressionStatement", 
        expression: expr 
      }); 
    }

expression
  = _ expr:(assignment / logicalOr / comparison / macroExpansion) _ { return expr; }

assignment
  = left:leftHandSide _ "=" _ right:expression {
      return locationInfo(location(), "Assignment", { type: "assignment", left, right });
    }

leftHandSide
  = memberExpression
  / identifier

logicalOr
  = head:logicalAnd tail:(_ "||" _ logicalAnd)* {
      return tail.reduce((result, element) => 
        locationInfo(location(), "LogicalOr", {
          type: "logicalOr",
          left: result,
          right: element[3]
        }), head);
    }

logicalAnd
  = head:comparison tail:(_ "&&" _ comparison)* {
      return tail.reduce((result, element) => 
        locationInfo(location(), "LogicalAnd", {
          type: "logicalAnd",
          left: result,
          right: element[3]
        }), head);
    }

comparison
  = head:addition tail:(_ ("<=" / ">=" / "==" / "!=" / "<" / ">") _ addition)* {
      return tail.reduce((result, element) => 
        locationInfo(location(), "Comparison", {
          type: "comparison",
          operator: element[1],
          left: result,
          right: element[3]
        }), head);
    }

addition
  = head:multiplication tail:(_ ("+" / "-") _ multiplication)* {
      return tail.reduce((result, element) => 
        locationInfo(location(), "Addition", {
          type: "addition",
          operator: element[1],
          left: result,
          right: element[3]
        }), head);
    }

multiplication
  = head:unary tail:(_ ("*" / "/" / "%") _ unary)* {
      return tail.reduce((result, element) => 
        locationInfo(location(), "Multiplication", {
          type: "multiplication",
          operator: element[1],
          left: result,
          right: element[3]
        }), head);
    }

unary
  = operator:("-" / "!" / "typeof") _ right:unary {
      return locationInfo(location(), "Unary", { type: "unary", operator, right });
    }
  / callExpression

callExpression
  = head:primaryExpression tail:(_ ("(" _ argumentList _ ")" / "[" _ expression _ "]" / "." _ identifier))* {
      return tail.reduce((result, element) => {
        if (element[1][0] === "(") {
          return locationInfo(location(), "FunctionCall", { type: "functionCall", callee: result, arguments: element[1][2] });
        } else if (element[1][0] === "[") {
          return locationInfo(location(), "MemberExpression", { type: "memberExpression", object: result, property: element[1][2], computed: true });
        } else {
          return locationInfo(location(), "MemberExpression", { type: "memberExpression", object: result, property: element[1][2], computed: false });
        }
      }, head);
    }

memberExpression
  = head:(
      "self" { return locationInfo(location(), "Self", { type: "self" }); }
    / primaryExpression
    )
    tail:("." identifier / "[" _ expression _ "]")* {
      return tail.reduce((result, element) => {
        if (element[0] === ".") {
          return locationInfo(location(), "MemberExpression", {
            type: "memberExpression",
            object: result,
            property: element[1],
            computed: false
          });
        } else {
          return locationInfo(location(), "MemberExpression", {
            type: "memberExpression",
            object: result,
            property: element[2],
            computed: true
          });
        }
      }, head);
    }

primaryExpression
  = awaitExpression
  / literal
  / arrayLiteral
  / objectCreation
  / macroExpansion
  / "self" { return locationInfo(location(), "Self", { type: "self" }); }
  / identifier
  / parenthesizedExpression

decorator
  = "@" name:identifier args:decoratorArgs? _ {
      return locationInfo(location(), "Decorator", { 
        type: "decorator",
        name,
        arguments: args || []
      });
    }

decoratorArgs
  = "(" _ args:argumentList? _ ")" {
      return args || [];
    }

parenthesizedExpression
  = "(" _ expression:expression _ ")" { return expression; }

objectCreation
  = "new" __ className:identifier _ "(" _ args:argumentList _ ")" {
      return locationInfo(location(), "ObjectCreation", { type: "objectCreation", className, arguments: args });
    }

arrayLiteral
  = "[" _ elements:arrayElements? _ "]" {
      return locationInfo(location(), "ArrayLiteral", { type: "arrayLiteral", elements: elements || [] });
    }

arrayElements
  = head:expression tail:(_ "," _ expression)* {
      return [head, ...tail.map(element => element[3])];
    }

identifier
  = !keyword name:[a-zA-Z_][a-zA-Z0-9_]* {
      return locationInfo(location(), "Identifier", { type: "identifier", name: text() });
    }

keyword
  = ("function" / "class" / "extends" / "constructor" / "var" / "let" / "const" 
     / "if" / "else" / "for" / "while" / "return" / "true" / "false" / "null" 
     / "new" / "macro" / "import" / "export" / "from" / "as" / "self" 
     / "async" / "await") !identifierPart
     
literal
  = number
  / string
  / boolean
  / char
  / arrayLiteral
  / nullLiteral

number
  = float
  / integer

nullLiteral
  = "null" { 
      return locationInfo(location(), "NullLiteral", { type: "nullLiteral", value: null }); 
    }

integer
  = digits:[0-9]+ { 
      return locationInfo(location(), "Integer", { type: "integer", value: parseInt(digits.join(""), 10) }); 
    }

float
  = digits:[0-9]+ "." fractional:[0-9]+ {
      return locationInfo(location(), "Float", { type: "float", value: parseFloat(digits.join("") + "." + fractional.join("")) });
    }

string
  = '"' chars:([^"\\] / EscapeSequence)* '"' {
      return locationInfo(location(), "String", { type: "string", value: chars.join("") });
    }

boolean
  = ("true" / "false") { 
      return locationInfo(location(), "Boolean", { type: "boolean", value: text() === "true" }); 
    }

char
  = "'" char:([^'\\] / EscapeSequence) "'" {
      return locationInfo(location(), "Char", { type: "char", value: char });
    }

EscapeSequence
  = "\\" (["\\/bfnrt] / UnicodeEscape)

UnicodeEscape
  = "u" digits:([0-9a-fA-F]{4}) {
      return String.fromCharCode(parseInt(digits.join(""), 16));
    }

argumentList
  = head:expression? tail:(_ "," _ expression)* {
      const args = head ? [head] : [];
      return args.concat(tail.map(element => element[3]));
    }

variableDeclaration
  = kind:("var" / "let" / "const") __ id:identifier _ initialization:("=" _ expression)? _ ";" _ {
      return locationInfo(location(), "VariableDeclaration", { 
        type: "variableDeclaration", 
        kind, 
        id, 
        init: initialization ? initialization[2] : null 
      });
    }

ifStatement
  = "if" _ "(" _ test:expression _ ")" _ consequent:block _
    else_clause:("else" _ (ifStatement / block))? {
      return locationInfo(location(), "IfStatement", {
        type: "ifStatement",
        test: test,
        consequent: consequent,
        alternate: else_clause ? else_clause[2] : null
      });
    }

forLoop
  = "for" _ "(" _ 
    init:(forInit)? _ ";" _ 
    test:expression? _ ";" _ 
    update:expression? _
    ")" _ body:block {
      return locationInfo(location(), "ForLoop", { 
        type: "forLoop", 
        init: init || null, 
        test: test || null, 
        update: update || null, 
        body 
      });
    }

forInit
  = variableDeclaration
  / expression

whileLoop
  = "while" _ "(" _ test:expression _ ")" _ body:block {
      return locationInfo(location(), "WhileLoop", { type: "whileLoop", test, body });
    }

returnStatement
  = "return" __ value:expression? _ ";" _ {
      return locationInfo(location(), "ReturnStatement", { type: "returnStatement", value });
    }

block
  = "{" _ statements:statement* _ "}" _ { return statements; }

functionDefinition
  = async:"async"? __ "function" __ name:identifier _ "(" _ params:parameterList _ ")" _ body:block {
      return locationInfo(location(), "FunctionDefinition", { 
        type: "functionDefinition", 
        name, 
        params, 
        body,
        isAsync: !!async 
      });
    }

classDefinition
  = decorators:decorator* _
    "class" __ name:identifier __ 
    extendsClause:("extends" __ identifier __)? 
    "{" _ 
    constructor:constructorDefinition?
    members:(methodDefinition / propertyDefinition)*
    _ "}" _ {
      return locationInfo(location(), "ClassDefinition", { 
        type: "classDefinition", 
        decorators,
        name, 
        superClass: extendsClause ? extendsClause[2] : null,
        constructor: constructor || { type: "constructorDefinition", params: [], body: [] },
        members 
      });
    }

constructorDefinition
  = "constructor" _ "(" _ params:parameterList _ ")" _ body:block {
      return locationInfo(location(), "ConstructorDefinition", { type: "constructorDefinition", params, body });
    }

methodDefinition
  = decorators:decorator* _
    async:"async"? __
    name:identifier _ "(" _ params:parameterList _ ")" _ body:block {
      return locationInfo(location(), "MethodDefinition", { 
        type: "methodDefinition", 
        decorators,
        name, 
        params, 
        body,
        isAsync: !!async
      });
    }

  awaitExpression
  = "await" __ expression:expression {
      return locationInfo(location(), "AwaitExpression", {
        type: "awaitExpression",
        argument: expression
      });
    }

propertyDefinition
  = name:identifier _ initializer:("=" _ expression)? _ ";" _ {
      return locationInfo(location(), "PropertyDefinition", { 
        type: "propertyDefinition", 
        name, 
        value: initializer ? initializer[2] : null 
      });
    }

parameterList
  = head:identifier? tail:(_ "," _ identifier)* {
      const params = head ? [head] : [];
      return params.concat(tail.map(element => element[3]));
    }

macroDefinition
  = "macro" __ name:identifier _ "(" _ params:parameterList _ ")" _ "{" _ body:macroBody _ "}" _ ";"? _ {
      return locationInfo(location(), "MacroDefinition", { type: "macroDefinition", name, params, body });
    }

macroExpansion
  = "#" name:identifier _ "(" _ args:argumentList? _ ")" {
      return locationInfo(location(), "MacroExpansion", { type: "macroExpansion", name, arguments: args || [] });
    }

macroBody
  = chars:[^}]* { return chars.join("").trim(); }

identifierPart
  = [a-zA-Z0-9_]

_
  = ([ \t\n\r] / comment)*

__
  = ([ \t\n\r] / comment)+

comment
  = singleLineComment
  / multiLineComment

singleLineComment
  = "//" [^\n]*

multiLineComment
  = "/*" (!"*/" .)* "*/"
start
  = _ program:moduleItem* _ { return program; }

moduleItem
  = importDeclaration
  / exportDeclaration
  / statement

importDeclaration
  = "import" __ "{" _ importSpecifiers:importSpecifier* _ "}" __ "from" __ source:string _ ";" _ {
      return { type: "importDeclaration", specifiers: importSpecifiers, source };
    }

importSpecifier
  = name:identifier __ ("as" __ alias:identifier)? {
      return { type: "importSpecifier", name, alias: alias || name };
    }

exportDeclaration
  = "export" __ declaration:(variableDeclaration / functionDefinition / classDefinition) {
      return { type: "exportDeclaration", declaration };
    }
  / "export" __ "{" _ exportSpecifiers:exportSpecifier* _ "}" _ ";" _ {
      return { type: "exportDeclaration", specifiers: exportSpecifiers };
    }

exportSpecifier
  = name:identifier __ ("as" __ alias:identifier)? {
      return { type: "exportSpecifier", name, alias: alias || name };
    }

statement
  = variableDeclaration
  / expressionStatement
  / ifStatement
  / forLoop
  / whileLoop
  / returnStatement
  / functionDefinition
  / classDefinition
  / macroDefinition

expressionStatement
  = expr:expression _ ";" _ { return expr; }

expression
  = assignment
  / logicalOr

assignment
  = left:leftHandSide _ "=" _ right:expression {
      return { type: "assignment", left, right };
    }

leftHandSide
  = memberExpression
  / identifier

logicalOr
  = head:logicalAnd tail:(_ "||" _ logicalAnd)* {
      return tail.reduce((result, [, , , right]) => ({
        type: "logicalOr",
        left: result,
        right: right
      }), head);
    }

logicalAnd
  = head:equality tail:(_ "&&" _ equality)* {
      return tail.reduce((result, [, , , right]) => ({
        type: "logicalAnd",
        left: result,
        right: right
      }), head);
    }

equality
  = head:comparison tail:(_ ("==" / "!=") _ comparison)* {
      return tail.reduce((result, [, op, , right]) => ({
        type: "equality",
        operator: op,
        left: result,
        right: right
      }), head);
    }

comparison
  = head:addition tail:(_ ("<" / "<=" / ">" / ">=") _ addition)* {
      return tail.reduce((result, [, op, , right]) => ({
        type: "comparison",
        operator: op,
        left: result,
        right: right
      }), head);
    }

addition
  = head:multiplication tail:(_ ("+" / "-") _ multiplication)* {
      return tail.reduce((result, [, op, , right]) => ({
        type: "addition",
        operator: op,
        left: result,
        right: right
      }), head);
    }

multiplication
  = head:unary tail:(_ ("*" / "/" / "%") _ unary)* {
      return tail.reduce((result, [, op, , right]) => ({
        type: "multiplication",
        operator: op,
        left: result,
        right: right
      }), head);
    }

unary
  = operator:("-" / "!" / "typeof") _ right:unary {
      return { type: "unary", operator, right };
    }
  / callExpression

callExpression
  = head:primaryExpression tail:(_ ("(" _ argumentList _ ")" / "[" _ expression _ "]" / "." _ identifier))* {
      return tail.reduce((result, [, expr]) => {
        if (expr[0] === "(") {
          return { type: "functionCall", callee: result, arguments: expr[2] };
        } else if (expr[0] === "[") {
          return { type: "memberExpression", object: result, property: expr[2], computed: true };
        } else {
          return { type: "memberExpression", object: result, property: expr[2], computed: false };
        }
      }, head);
    }

memberExpression
  = callExpression

primaryExpression
  = literal
  / objectCreation
  / identifier
  / parenthesizedExpression

parenthesizedExpression
  = "(" _ expression:expression _ ")" { return expression; }

objectCreation
  = "new" __ className:identifier _ "(" _ args:argumentList _ ")" {
      return { type: "objectCreation", className, arguments: args };
    }

identifier
  = !keyword name:[a-zA-Z_][a-zA-Z0-9_]* {
      return { type: "identifier", name: text() };
    }

keyword
  = ("function" / "class" / "extends" / "constructor" / "var" / "let" / "const" / "if" / "else" / "for" / "while" / "return" / "true" / "false" / "null" / "new" / "macro" / "import" / "export" / "from" / "as") !identifierPart

literal
  = number
  / string
  / boolean
  / char

number
  = float
  / integer

integer
  = digits:[0-9]+ { return { type: "integer", value: parseInt(digits.join(""), 10) }; }

float
  = digits:[0-9]+ "." fractional:[0-9]+ {
      return { type: "float", value: parseFloat(digits.join("") + "." + fractional.join("")) };
    }

string
  = '"' chars:([^"\\] / EscapeSequence)* '"' {
      return { type: "string", value: chars.join("") };
    }

boolean
  = ("true" / "false") { return { type: "boolean", value: text() === "true" }; }

char
  = "'" char:([^'\\] / EscapeSequence) "'" {
      return { type: "char", value: char };
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
      return args.concat(tail.map(t => t[3]));
    }

variableDeclaration
  = kind:("var" / "let" / "const") __ id:identifier _ "=" _ init:expression _ ";" _ {
      return { type: "variableDeclaration", kind, id, init };
    }

ifStatement
  = "if" _ "(" _ test:expression _ ")" _ consequent:block _ ("else" _ alternate:block)? {
      return { type: "ifStatement", test, consequent, alternate };
    }

forLoop
  = "for" _ "(" _ init:(variableDeclaration / expressionStatement)? _ ";" _ test:expression? _ ";" _ update:expression? _ ")" _ body:block {
      return { type: "forLoop", init, test, update, body };
    }

whileLoop
  = "while" _ "(" _ test:expression _ ")" _ body:block {
      return { type: "whileLoop", test, body };
    }

returnStatement
  = "return" __ value:expression? _ ";" _ {
      return { type: "returnStatement", value };
    }

block
  = "{" _ statements:statement* "}" _ { return statements; }

functionDefinition
  = "function" __ name:identifier _ "(" _ params:parameterList _ ")" _ body:block {
      return { type: "functionDefinition", name, params, body };
    }

classDefinition
  = "class" __ name:identifier __ ("extends" __ superClass:identifier __)? "{" _ 
    constructor:constructorDefinition?
    members:(methodDefinition / propertyDefinition)*
    "}" _ {
      return { 
        type: "classDefinition", 
        name, 
        superClass, 
        constructor: constructor || { type: "constructorDefinition", params: [], body: [] },
        members 
      };
    }

constructorDefinition
  = "constructor" _ "(" _ params:parameterList _ ")" _ body:block {
      return { type: "constructorDefinition", params, body };
    }

methodDefinition
  = name:identifier _ "(" _ params:parameterList _ ")" _ body:block {
      return { type: "methodDefinition", name, params, body };
    }

propertyDefinition
  = name:identifier _ ("=" _ value:expression)? _ ";" _ {
      return { type: "propertyDefinition", name, value };
    }

parameterList
  = head:identifier? tail:(_ "," _ identifier)* {
      const params = head ? [head] : [];
      return params.concat(tail.map(t => t[3]));
    }

macroDefinition
  = "macro" __ name:identifier _ "(" _ params:parameterList _ ")" _ "{" _ body:macroBody _ "}" _ {
      return { type: "macroDefinition", name, params, body };
    }

macroBody
  = chars:[^}]* { return chars.join(""); }

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
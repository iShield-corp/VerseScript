const VerseScript = require('../src/interpreter');

jest.spyOn(console, 'log').mockImplementation(() => {});

describe('VerseScript Interpreter', () => {
  let vs;

  beforeAll(() => {
    console.log.mockRestore();
    console.log('Starting VerseScript Interpreter tests');
  });

  beforeEach(() => {
    vs = new VerseScript();
  });

  afterAll(() => {
    console.log('Finished VerseScript Interpreter tests');
  });

  const testCases = [
    ['Variable declaration and assignment', `
      var x = 5;
      var y = 10;
      var z = x + y;
    `, () => {
      expect(vs.globalScope.x).toBe(5);
      expect(vs.globalScope.y).toBe(10);
      expect(vs.globalScope.z).toBe(15);
    }],
    ['Function definition and call', `
      function adds(a, b) {
        return a + b;
      }
      var result = adds(3, 4);
    `, () => {
      expect(vs.currentScope.result).toBe(7);
    }],
    ['If statement', `
      var x = 10;
      var y = "neither";
      if (x > 5) {
        y = "greater";
      } else {
        y = "lesser";
      }
    `, () => {
      expect(vs.currentScope.y).toBe("greater");
    }],
    ['For loop', `
      var sum = 0;
      for (i = 1; i <= 5; i = i + 1) {
        sum = sum + i;
      }
    `, () => {
      expect(vs.currentScope.sum).toBe(15);
    }],
    /*['While loop', `
      count = 0;
      x = 5;
      while (x > 0) {
        count = count + 1;
        x = x + 1;
      }
    `, () => {
      expect(vs.globalScope.count).toBe(5);
    }],*/
    ['Class definition and object creation', `
      class Rectangle {
        constructor(width, height) {
          self.width = width;
          self.height = height;
        }
        
        area() {
          return self.width * self.height;
        }
      }
      
      var rect = new Rectangle(5, 3);
      var area = rect.area();
      //print(area);
    `, () => {
      expect(vs.currentScope.area).toBe(15);
    }],
    ['Built-in function: add', `
      var sum = add(5, 3);
    `, () => {
      expect(vs.globalScope.sum).toBe(8);
    }],
    ['Built-in function: toJson and parseJson', `
      class Person {
        constructor(name, age) {
          self.name = name;
          self.age = age;
        }
      }
      var obj = new Person("John", 30);
      var jsonStr = toJson(obj);
      var parsedObj = parseJson(jsonStr);
    `, () => {
      expect(typeof vs.globalScope.jsonStr).toBe('string');
      expect(vs.globalScope.parsedObj).toEqual({name: "John", age: 30});
    }],
    ['Built-in function: getStringLength', `
      var len = getStringLength("Hello");
    `, () => {
      expect(vs.globalScope.len).toBe(5);
    }],
    ['Built-in functions: arrayPush and arrayPop', `
      var arr = [1, 2, 3];
      arrayPush(arr, 4);
      var popped = arrayPop(arr);
    `, () => {
      expect(vs.globalScope.arr).toEqual([1, 2, 3]);
      expect(vs.globalScope.popped).toBe(4);
    }],
    ['Macro definition and expansion', `
      macro DOUBLE(x) {
        x + x
      };
      var result = #DOUBLE(5);
    `, () => {
      expect(vs.globalScope.result).toBe(10);
    }],
    ['Nested function calls', `
      function multiply(a, b) {
        return a * b;
      }
      function square(x) {
        return multiply(x, x);
      }
      var result = square(4);
    `, () => {
      expect(vs.globalScope.result).toBe(16);
    }],
    ['Recursive function', `
      function factorial(n) {
        if (n <= 1) {
          return 1;
        }
        return n * factorial(n - 1);
      }
      var result = factorial(5);
    `, () => {
      expect(vs.globalScope.result).toBe(120);
    }]
  ];

  test.each(testCases)('%s', (testName, code, assertions) => {
    console.log(`Starting test: ${testName}`);
    vs.interpret(code);
    console.log(`Finished interpreting code for: ${testName}`);
    assertions();
    console.log(`Completed test: ${testName}`);
  });

  test('Error handling: Undefined variable', () => {
    console.log('Starting test: Error handling: Undefined variable');
    expect(() => {
      vs.interpret(`
        var y = x + 5;
      `);
    }).toThrow("Undefined variable: x");
    console.log('Completed test: Error handling: Undefined variable');
  });

  test('Error handling: Type mismatch', () => {
    console.log('Starting test: Error handling: Type mismatch');
    vs.interpret(`
      var x = "5" + 10;
    `);
    expect(vs.globalScope.x).toBe("510");
    console.log('Completed test: Error handling: Type mismatch');
  });
});
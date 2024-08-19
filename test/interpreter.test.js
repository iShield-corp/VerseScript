import VerseScript from '../src/interpreter';

jest.spyOn(console, 'log').mockImplementation(() => {});

describe('VerseScript Interpreter', () => {
  let vs;
  let consoleSpy;

  beforeAll(() => {
    console.log.mockRestore();
    console.log('Starting VerseScript Interpreter tests');
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  });

  beforeEach(() => {
    vs = new VerseScript();
    consoleSpy.mockClear();
    class JSPerson {
      constructor(name) {
        this.name = name;
      }
  
      greet() {
        return `Hello, ${this.name}!`;
      }
  
      static sayHi() {
        return "Hi there!";
      }
    }
    // Add the JSPerson class to VerseScript

    vs.addJsClass('JSPerson', JSPerson);
  });

  afterAll(() => {
    console.log('Finished VerseScript Interpreter tests');
    consoleSpy.mockRestore();
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
    ['Class definition, inheritance, and object creation', `
      try {
        class Shape {
          constructor(name) {
            self.name = name;
            print("Shape constructor called with name: " + name);
          }
          
          describe() {
            print("Shape describe method called");
            return "This is a " + self.name;
          }
        }
    
        class Rectangle extends Shape {
          constructor(width, height) {
            print("Rectangle constructor called with width: " + width + ", height: " + height);
            super("rectangle");
            self.width = width;
            self.height = height;
          }
          
          area() {
            print("Rectangle area method called");
            return self.width * self.height;
          }
    
          describe() {
            print("Rectangle describe method called");
            return super.describe() + " with area " + self.area();
          }
        }
        
        print("Creating Rectangle instance");
        var rect = new Rectangle(5, 3);
        print("Calling describe method");
        var description = rect.describe();
        print("Calling area method");
        var area = rect.area();
        print("Final description: " + description);
        print("Final area: " + area);
      } catch (error) {
        print("Error occurred: " + error.message);
        print("Error stack: " + error.stack);
      }
    `, () => {

      console.log('All console.log calls:');
      consoleSpy.mock.calls.forEach((call, index) => {
        console.log(`${index}: ${call[0]}`);
      });

      // Check for the expected log calls
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringMatching(/^Error occurred:/));
      expect(consoleSpy).toHaveBeenCalledWith("Creating Rectangle instance");
      expect(consoleSpy).toHaveBeenCalledWith("Rectangle constructor called with width: 5, height: 3");
      expect(consoleSpy).toHaveBeenCalledWith("Shape constructor called with name: rectangle");
      expect(consoleSpy).toHaveBeenCalledWith("Calling describe method");
      expect(consoleSpy).toHaveBeenCalledWith("Rectangle describe method called");
      expect(consoleSpy).toHaveBeenCalledWith("Shape describe method called");
      expect(consoleSpy).toHaveBeenCalledWith("Rectangle area method called");
      expect(consoleSpy).toHaveBeenCalledWith("Final description: This is a rectangle with area 15");
      expect(consoleSpy).toHaveBeenCalledWith("Final area: 15");
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
    ['Importing and using a JavaScript class', `
      var person = new JSPerson("Alice");
      var greeting = person.greet();
      var staticGreeting = person.sayHi();
      var newGreeting = person.greet();
    `, () => {
      expect(vs.globalScope.greeting).toBe("Hello, Alice!");
      expect(vs.globalScope.staticGreeting).toBe("Hi there!");
      expect(vs.globalScope.newGreeting).toBe("Hello, Bob!");
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
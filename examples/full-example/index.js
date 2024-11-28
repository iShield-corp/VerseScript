
class compute {
  constructor() {
    this.result = 0;
  }

  add(x,y) {
    return x + y;
  }
}

const interpreter = new Verse.VerseScript();

interpreter.addJsClass("compute", compute);

let script = `
     try {
      class DataProcessor {
    @memoize
    processLargeNumber(n) {
        print("Processing...");
        // Simulate expensive calculation
        var result = 0;
        //for(var i = 0; i < n * 1000000; i++) {
            result = result + 500;
        //}
        return result;
    }
}

var processor = new DataProcessor();

// First call - will be slow
print(processor.processLargeNumber(1));  // Shows "Processing..."
                                        // Takes some time

// Second call - instant result
print(processor.processLargeNumber(1));



        var com = new compute();
        print(com.add(3,3));

        class Shape {
          constructor(name) {
            self.name = name;
            print("2");
            //print("Shape constructor called with name: " + name);
          }
          
          describe() {
            print("Shape describe method called");
            return "This is a " + self.name;
          }
        }
    
        macro validateNumber(num) {
          typeof num == "number" && !isNaN(num)
        };

        // Use the macro in functions
        function divide(a, b) {
          if (!#validateNumber(a) || !#validateNumber(b)) {
            print("Invalid numbers");
            return null;
          }
          if (b == 0) {
            print("Cannot divide by zero");
            return null;
          }
          return a / b;
        }

        print(divide(10, 2));    // Outputs: 5
        print(divide("10", 2));  // Outputs: Invalid numbers
        print(divide(10, 0));


        class Rectangle extends Shape {
          constructor(width, height) {
            print("1");
            //print("Rectangle constructor called with width: " + width + ", height: " + height);
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
`

interpreter.interpret(script);
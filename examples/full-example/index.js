


const interpreter = new Verse.VerseScript();
let script = `
     try {
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
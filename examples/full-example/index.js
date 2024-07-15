


const interpreter = new Verse.VerseScript();
let script = `
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
      //print(rect);
`

interpreter.interpret(script);
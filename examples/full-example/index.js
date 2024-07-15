


const interpreter = new Verse.VerseScript();
let script = `
      macro DOUBLE(x) {
        x + x
      };
      var result = #DOUBLE(5);
      print(result);
`

interpreter.interpret(script);
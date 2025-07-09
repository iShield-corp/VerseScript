
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
     class DataProcessor {
    constructor() {
        self.data = [];
        self._processors = {};
    }
    
    registerProcessor(name, processor) {
        self._processors[name] = processor;
    }
    
    addData(item) {
        arrayPush(self.data, item);
    }
    
    @memoize
    process(processorName) {
        try {
            var processor = self._processors[processorName];
            if (!processor) {
                throw "Processor not found: " + processorName;
            }
            
            var results = [];
            for (var i = 0; i < getStringLength(toJson(self.data)); i++) {
                try {
                    var result = processor(self.data[i]);
                    arrayPush(results, result);
                } catch (itemError) {
                    print("Error processing item " + i + ": " + itemError);
                    arrayPush(results, null);
                }
            }
            
            return results;
        } catch (error) {
            print("Processing error: " + error);
            return [];
        }
    }
}

var processor = new DataProcessor();

processor.registerProcessor("double", function(x) {
    if (typeof x != "number") {
        throw "Expected number, got " + typeof x;
    }
    return x * 2;
});

processor.addData(1);
processor.addData(2);
processor.addData("invalid");
processor.addData(4);

var results = processor.process("double");
print("Processing results: " + toJson(results));
`

interpreter.interpret(script);
# VerseScript

VerseScript is a custom scripting language designed for flexible and powerful scripting in various environments, with a focus on interactive and immersive experiences.

## Features

- Intuitive syntax for easy scripting
- Import/export system for modular code organization
- Object-oriented programming support with classes and inheritance
- Built-in functions for common operations
- Macro system for code reuse and abstraction
- Integration with JavaScript for extended functionality

## Installation

To use VerseScript in your project, you can install it via npm:

```bash
npm install versescript
```

## Usage

Here's a basic example of how to use VerseScript in your project:

```javascript
import { VerseScript } from 'versescript';

const interpreter = new VerseScript();

const script = `
  // Define a function
  function greet(name) {
    return "Hello, " + name + "!";
  }

  // Use the function and print the result
  var message = greet("World");
  print(message);

  // Basic arithmetic
  var result = 5 + 3 * 2;
  print("The result is: " + result);

  // Conditional statement
  if (result > 10) {
    print("Result is greater than 10");
  } else {
    print("Result is not greater than 10");
  }
`;

interpreter.interpret(script);
```

This example demonstrates basic VerseScript features such as function definition, variable declaration, string concatenation, arithmetic operations, and conditional statements.

## API Reference

For detailed API documentation, run:

```bash
npm run docs
```

This will generate the documentation in the `docs` directory.

## Development

### Prerequisites

- Node.js (version specified in package.json)
- npm

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/versescript.git
   cd versescript
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Building

To build VerseScript:

- For development (with watch mode):
  ```bash
  npm run build:dev
  ```

- For production:
  ```bash
  npm run build:prod
  ```

### Scripts

- `npm run compile:grammar`: Compile the PEG.js grammar
- `npm run format`: Format the code using Prettier
- `npm run docs`: Generate documentation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- PEG.js for the parser generator
- Webpack for bundling


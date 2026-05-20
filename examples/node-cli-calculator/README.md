# Node.js CLI Calculator

A simple command-line calculator built with Node.js.

## Features

- Basic arithmetic operations: `add`, `sub`, `mul`, `div`, `pow`
- No external dependencies
- Clear error messages and usage instructions
- Non-zero exit codes for invalid usage

## Requirements

- Node.js 20 or newer

## Installation

```bash
npm install
```

## Usage

```bash
node bin/calculator.js <operation> <num1> <num2>
```

### Operations

- `add`: Addition
- `sub`: Subtraction
- `mul`: Multiplication
- `div`: Division
- `pow`: Power

### Examples

```bash
node bin/calculator.js add 10 20
# Output: 30

node bin/calculator.js sub 10 20
# Output: -10

node bin/calculator.js mul 10 20
# Output: 200

node bin/calculator.js div 10 20
# Output: 0.5

node bin/calculator.js pow 10 2
# Output: 100
```

### Help

```bash
node bin/calculator.js --help
```

## Error Handling

The calculator will exit with a non-zero status code and display an error message for:

- Invalid number of arguments
- Unknown operations
- Invalid number inputs
- Division by zero

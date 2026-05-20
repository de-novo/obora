#!/usr/bin/env node

const operations = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => {
    if (b === 0) {
      throw new Error("Division by zero");
    }
    return a / b;
  },
  pow: (a, b) => Math.pow(a, b),
};

const helpText = `
Usage: calculator <operation> <num1> <num2>

Operations:
  add  - Addition (num1 + num2)
  sub  - Subtraction (num1 - num2)
  mul  - Multiplication (num1 * num2)
  div  - Division (num1 / num2)
  pow  - Power (num1 ^ num2)

Options:
  --help, -h  Show this help message

Examples:
  calculator add 10 20
  calculator sub 10 20
  calculator mul 10 20
  calculator div 10 20
  calculator pow 10 20
`;

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(helpText);
    process.exit(0);
  }

  if (args.length !== 3) {
    console.error("Error: Invalid number of arguments.");
    console.error("Usage: calculator <operation> <num1> <num2>");
    console.error("Try 'calculator --help' for more information.");
    process.exit(1);
  }

  const [op, num1Str, num2Str] = args;

  if (!operations[op]) {
    console.error(`Error: Unknown operation '${op}'.`);
    console.error("Supported operations: add, sub, mul, div, pow");
    process.exit(1);
  }

  const num1 = parseFloat(num1Str);
  const num2 = parseFloat(num2Str);

  if (isNaN(num1) || isNaN(num2)) {
    console.error("Error: Invalid number input.");
    console.error("Please provide valid numbers for num1 and num2.");
    process.exit(1);
  }

  try {
    const result = operations[op](num1, num2);
    console.log(result);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();

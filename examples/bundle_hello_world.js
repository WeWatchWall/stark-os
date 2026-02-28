// Isomorphic JavaScript - works in both Node.js and browser environments
// Export a default function that the runtime will call
// Uses CommonJS format for compatibility with the pack executor's new Function() wrapper
//
// Usage:
//   stark pod create hello-world-pack --arg Alice
//   → prints "Hello Alice"
//
//   stark pod create hello-world-pack
//   → prints "Hello World"
module.exports.default = function(context) {
  var name = (context.args && context.args.length > 0) ? context.args[0] : 'World';
  var greeting = 'Hello ' + name;
  if (typeof console !== 'undefined' && console.log) {
    console.log(greeting);
  }
  return { message: greeting };
};
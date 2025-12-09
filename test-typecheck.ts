// Test file for TypeScript type checking feature

interface User {
  name: string;
  age: number;
}

// Error: Type 'string' is not assignable to type 'number'
const user: User = {
  name: "John",
  age: "25"  // This should cause a type error
};

// Error: Property 'email' does not exist on type 'User'
console.log(user.email);

// Warning: Parameter 'x' implicitly has an 'any' type
function add(x, y) {
  return x + y;
}

// This should work fine
const validUser: User = {
  name: "Jane",
  age: 30
};

export { user, add, validUser };

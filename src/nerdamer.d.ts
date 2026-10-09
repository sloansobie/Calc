declare module "nerdamer/all.js" {
  interface Expression {
    text(): string;
    toTeX(): string;
  }
  const nerdamer: (expression: string) => Expression;
  export default nerdamer;
}

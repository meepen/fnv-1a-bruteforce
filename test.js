import Workers from "./driver.js";

let workers = new Workers(8);
workers.on("found", (result) => {
	console.log("worker found result: " + result);
});
let start = Date.now();

console.log(await workers.search([0x6a311cecn], 6));

workers.close();
console.log(`took ${Date.now() - start}ms`);

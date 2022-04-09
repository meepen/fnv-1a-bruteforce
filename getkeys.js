import { readFile, writeFile } from "fs/promises";
import Workers from "./driver.js";

let json = JSON.parse(await readFile("./data/tft.json"));

function findKeys(obj, results = []) {
	for (let key in obj) {
		if (!obj.hasOwnProperty(key)) {
			continue;
		}
		if (key[0] === '{' && results.indexOf(key) === -1) {
			results.push(key);
		}

		if (typeof obj[key] === "object") {
			findKeys(obj[key], results);
		}
	}

	return results;
}

let workers = new Workers(8);
let searchFor = findKeys(json).map(x => BigInt(parseInt(x.slice(1, -1), 16)));

let start = Date.now();
let results = await workers.search(searchFor, 5);
console.log(`Finished in ${Date.now() - start} ms`);

workers.close();

await writeFile("./data/unknown.json", JSON.stringify(results, null, "    "));
console.log("written to data/unknown.json");

import { fork } from "child_process";
import { EventEmitter } from "events";
import { hash } from "./hash.js"
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Worker extends EventEmitter {
	constructor() {
		super();
		this.process = fork(`${__dirname}/worker.js`, {
			stdio: [ 'ipc', 'inherit', 'inherit' ]
		});
	}

	async findHashes(characterCount, targetHashes, startHash = 0x811c9dc5n) {
		let old = this.queue;
		let ourPromise;
		new Promise((res, rej) => { ourPromise = this.queue = res; });
		if (old) {
			await old;
		}

		this.process.send({
			characterCount,
			targetHashes: [...targetHashes].map(Number),
			startHash: Number(startHash)
		});

		let found = [];

		let message;
		while (message = await new Promise(res => this.process.once("message", res))) {
			found.push(message);
		}

		if (ourPromise === this.queue) {
			this.queue = null;
		}

		return found;
	}

	close() {
		this.process.kill();
	}
};

const MaxCharacterWorkload = 4;
const a = 'a'.charCodeAt(0);
const z = 'z'.charCodeAt(0);

export default class Workers extends EventEmitter {
	constructor(workerCount) {
		super();
		this.workers = (new Array(workerCount)).fill(1).map(x => new Worker());
	}

	*jobs(maxCharacters, startHash = 0x811c9dc5n) {
		// first do the pairs of characters that don't have the full thing
		for (let characterCount = 1; characterCount <= Math.min(maxCharacters, MaxCharacterWorkload); characterCount++) {
			yield {
				characterCount: characterCount,
				startHash,
				startCharacters: ""
			};
		}

		if (maxCharacters <= MaxCharacterWorkload) {
			return;
		}

		for (let characterCount = MaxCharacterWorkload; characterCount < maxCharacters; characterCount++) {
			let currentCharacters = (new Array(characterCount - MaxCharacterWorkload + 1)).fill(a);
			let remaining = 1n;
			for (let i = 0; i < currentCharacters.length; i++) {
				remaining *= 26n;
			}
			
			while (remaining--) {
				let startCharacters = String.fromCharCode(...currentCharacters.slice().reverse());
				yield {
					characterCount: MaxCharacterWorkload,
					startHash: hash(startCharacters, startHash),
					startCharacters
				};

				for (let i = 0; ++currentCharacters[i] > z; i++) {
					currentCharacters[i] = a;
				}
			}
		}
	}

	findWork(worker) {
		let job = this.generator.next();
		if (job.done) {
			worker.finish();
			return;
		}

		worker.findHashes(job.value.characterCount, this.targetHashes, job.value.startHash).then(results => {
			results = results.map(x => job.value.startCharacters + x);
			this.results = this.results.concat(results);
			for (let result of results) {
				this.emit("found", result, hash(result));
			}
			this.findWork(worker);
		});
	}

	async search(targets, maxCharacters = 8, startHash) {
		this.generator = this.jobs(maxCharacters, startHash);
		this.targetHashes = targets;
		this.results = [];

		let id = 0;
		for (let worker of this.workers) {
			worker.id = id++;
			worker.promise = new Promise(finish => worker.finish = finish);
			this.findWork(worker);
		}

		await Promise.all(this.workers.map(x => x.promise));
		
		let ret = {};

		for (let result of this.results) {
			let hashResult = hash(result, startHash);
			if (!(hashResult in ret)) {
				ret[hashResult] = [];
			}

			ret[hashResult].push(result);
		}

		return ret;
	}

	close() {
		for (let worker of this.workers) {
			worker.close();
		}
	}
}
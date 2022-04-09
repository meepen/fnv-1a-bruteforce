
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

	*jobs(maxCharacters) {
		// first do the pairs of characters that don't have the full thing
		for (let characterCount = 1; characterCount <= Math.min(maxCharacters, MaxCharacterWorkload); characterCount++) {
			yield {
				characterCount: characterCount,
				startHash: 0x811c9dc5n,
				startCharacters: ""
			};
		}

		if (maxCharacters <= MaxCharacterWorkload) {
			return;
		}

		for (let characterCount = MaxCharacterWorkload; characterCount < maxCharacters; characterCount++) {
			let current = (new Array(characterCount - MaxCharacterWorkload + 1)).fill(a);
			let remaining = 1n;
			for (let i = 0; i < current.length; i++) {
				remaining *= 26n;
			}
			
			while (remaining--) {
				let startCharacters = String.fromCharCode(...current.reverse());
				yield {
					characterCount: MaxCharacterWorkload,
					startHash: hash(startCharacters),
					startCharacters
				};

				for (let i = 0; current[i]++ === z; i++) { }
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

	async search(targets, maxCharacters = 8) {
		this.generator = this.jobs(maxCharacters);
		this.targetHashes = targets;
		this.results = [];

		let id = 0;
		for (let worker of this.workers) {
			worker.id = id++;
			worker.promise = new Promise(finish => worker.finish = finish);
			this.findWork(worker);
		}

		await Promise.all(this.workers.map(x => x.promise));

		return this.results.sort();
	}

	close() {
		for (let worker of this.workers) {
			worker.close();
		}
	}
}
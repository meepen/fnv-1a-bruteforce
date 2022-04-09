let data = [];

const a = BigInt('a'.charCodeAt(0));
const z = BigInt('z'.charCodeAt(0));

while (1) {
	let { startHash, characterCount, targetHashes } = await new Promise(res => process.once("message", res));

	startHash = BigInt(startHash);
	targetHashes = new BigInt64Array(targetHashes.map(BigInt));

	let totalRuns = 1n;
	for (let i = 0; i < characterCount; i++) {
		totalRuns *= 26n;
	}

	// add one to the size of these so the last iteration doesn't error
	let characterList = (new BigInt64Array(characterCount + 1)).fill(a, 0, characterCount);
	let hashStorage = new BigInt64Array(characterCount + 1);
	hashStorage[0] = startHash;
	for (let i = characterCount - 1; i >= 0; i--) {
		hashStorage[i] = startHash;
		startHash = ((startHash ^ a) * 0x01000193n) & 0xFFFFFFFFn;
	}

	let currentHash = hashStorage[0] || startHash;

	while (totalRuns--) {
		// hash
		let nextHash = ((currentHash ^ characterList[0]) * 0x01000193n) & 0xFFFFFFFFn;
		if (targetHashes.indexOf(nextHash) !== -1) {
			process.send(String.fromCharCode(...[...characterList].reverse().slice(1).map(Number)));
		}

		let i;
		for (i = 0; characterList[i]++ === z; i++) {
			characterList[i] = a;
		}

		while (i-- > 0) {
			hashStorage[i] = currentHash = ((hashStorage[i + 1] ^ characterList[i + 1]) * 0x01000193n) & 0xFFFFFFFFn;
		}
	}

	process.send(false);
}


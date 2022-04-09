export function hash(str, prev = 0x811c9dc5n) {
	for (let c of Buffer.from(str.toLowerCase(), "utf8")) {
		prev = ((prev ^ BigInt(c)) * 0x01000193n) & 0xFFFFFFFFn;
	}
	return prev;
}
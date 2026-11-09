let valid = [
	// Integers
	0,
	1,
	9,
	10,
	123,
	999999,

	// Leading zeros (decimal)
	0,
	0.0,

	// Decimals
	1.2,
	0.3,
	0.5,
	0.123,
	1.0,
	123.456,
	0.0001,
	1.123456789,

	// Trailing decimal point
	1,
	10,
	123,

	// Scientific notation
	1,
	1e1,
	1e10,
	1e100,
	1e10,
	1e-1,
	1e-10,
	1e1,
	1e10,
	1.2e3,
	1.2e-3,
	0.5e2,
	5e2,
	123.456e-10,

	// Numeric separators
	1_000,
	10_000,
	1_000_000,
	1_234.567_890,
	1e1_0,
	0.1_2,

	// Hexadecimal
	0x0,
	0x1,
	0x10,
	0xff,
	0xff,
	0xdeadbeef,

	// Binary
	0b0,
	0b1,
	0b10,
	0b1010,
	0b11111111,

	// Octal
	0o0,
	0o1,
	0o10,
	0o77,
	0o777,

	// BigInt
	0n,
	1n,
	123n,
	0xffn,
	0b1010n,
	0o777n,
	1_000n,
];

// Port of PeepoDrumKit "core_string.h" / "core_string.cpp" (ASCII namespace)
// https://github.com/samyuu/PeepoDrumKit

export const IsWhitespace = (c: string): boolean => (c === ' ' || c === '\t' || c === '\r' || c === '\n');
export function IsAllWhitespace(v: string): boolean { for (let i = 0; i < v.length; i++) { if (!IsWhitespace(v[i])) return false; } return true; }

export const MatchesInsensitive = (a: string, b: string): boolean => (a.length === b.length) && (a.toLowerCase() === b.toLowerCase());
export const StartsWith = (v: string, prefix: string): boolean => v.startsWith(prefix);
export const EndsWith = (v: string, suffix: string): boolean => v.endsWith(suffix);

export function TrimLeft(v: string): string { let i = 0; while (i < v.length && IsWhitespace(v[i])) i++; return v.substring(i); }
export function TrimRight(v: string): string { let i = v.length; while (i > 0 && IsWhitespace(v[i - 1])) i--; return v.substring(0, i); }
export const Trim = (v: string): string => TrimRight(TrimLeft(v));
export const TrimPrefix = (v: string, prefix: string): string => StartsWith(v, prefix) ? v.substring(prefix.length) : v;
export const TrimSuffix = (v: string, suffix: string): string => EndsWith(v, suffix) ? v.substring(0, v.length - suffix.length) : v;

export function ForEachLineInMultiLineString(multiLineString: string, includeEmptyTrailingLine: boolean, perLineFunc: (line: string) => void): void
{
	const end = multiLineString.length;
	let lineBegin = 0;

	if (includeEmptyTrailingLine && end === 0)
		perLineFunc("");

	for (let readHead = 0; readHead < end; readHead++)
	{
		if (readHead + 1 === end)
		{
			perLineFunc(multiLineString.substring(lineBegin, end));
			if (includeEmptyTrailingLine && multiLineString[end - 1] === '\n')
				perLineFunc("");
		}
		else if (multiLineString[readHead] === '\n')
		{
			const lineEnd = (readHead - 1 >= 0 && multiLineString[readHead - 1] === '\r') ? (readHead - 1) : readHead;
			perLineFunc(multiLineString.substring(lineBegin, Math.max(lineBegin, lineEnd)));
			lineBegin = (readHead + 1);
		}
	}
}

export function ForEachInCharSeparatedList(separatedList: string, separator: string, perValueFunc: (value: string) => void): void
{
	for (let absoluteIndex = 0; absoluteIndex < separatedList.length; absoluteIndex++)
	{
		const separatorIndex = separatedList.indexOf(separator, absoluteIndex);
		const separatedValue = separatedList.substring(absoluteIndex, (separatorIndex < 0) ? separatedList.length : separatorIndex);
		perValueFunc(separatedValue);
		absoluteIndex += separatedValue.length;
	}
}

export const ForEachInCommaSeparatedList = (list: string, perValueFunc: (value: string) => void) => ForEachInCharSeparatedList(list, ',', perValueFunc);
export const ForEachInSpaceSeparatedList = (list: string, perValueFunc: (value: string) => void) => ForEachInCharSeparatedList(list, ' ', perValueFunc);

// NOTE: Mirroring the strictness of std::from_chars() requiring the entire string to be parsed (no leading '+' or whitespace)
const I32Regex = /^-?\d+$/;
const F32Regex = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function TryParseI32(s: string): number | null
{
	if (!I32Regex.test(s)) return null;
	const v = parseInt(s, 10);
	return (v >= -2147483648 && v <= 2147483647) ? v : null;
}

export function TryParseF32(s: string): number | null
{
	if (!F32Regex.test(s)) return null;
	const v = parseFloat(s);
	return Number.isFinite(v) ? v : null;
}

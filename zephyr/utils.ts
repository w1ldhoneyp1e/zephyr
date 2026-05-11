type LazyValue<TResult> = TResult | (() => TResult)

type MatchCases<TKey extends PropertyKey, TResult> = {
	[K in TKey]: LazyValue<TResult>
}

type ChooseBranch<TResult> = readonly [boolean, LazyValue<TResult>]

function match<TKey extends PropertyKey, TResult>(
	value: TKey,
	cases: MatchCases<TKey, TResult>,
): TResult {
	const selected = cases[value] as LazyValue<TResult>

	return resolveLazyValue(selected)
}

function choose<TResult>(
	...branches: [...ChooseBranch<TResult>[], LazyValue<TResult>]
): TResult {
	const defaultValue = branches[branches.length - 1] as LazyValue<TResult>
	const conditions = branches.slice(0, -1) as ChooseBranch<TResult>[]
	for (const [when, value] of conditions) {
		if (when) {
			return resolveLazyValue(value)
		}
	}

	return resolveLazyValue(defaultValue)
}

function resolveLazyValue<TResult>(value: LazyValue<TResult>): TResult {
	if (typeof value === 'function') {
		return (value as () => TResult)()
	}

	return value
}

export {
	type ChooseBranch,
	type MatchCases,
	choose,
	match,
}

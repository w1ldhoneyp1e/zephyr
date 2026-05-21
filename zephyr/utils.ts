type LazyValue<TResult> = TResult | (() => TResult)
type MatchBranchValue<TResult, TInput> = TResult | ((input: TInput) => TResult)

type MatchCases<TKey extends PropertyKey, TResult> = {
	[K in TKey]: LazyValue<TResult>
}

type DiscriminatedMatchCases<
	TValue extends Record<TDiscriminant, PropertyKey>,
	TDiscriminant extends keyof TValue,
	TResult,
> = {
	[K in TValue[TDiscriminant] & PropertyKey]: MatchBranchValue<TResult, Extract<TValue, Record<TDiscriminant, K>>>
}

type ChooseBranch<TResult> = readonly [boolean, LazyValue<TResult>]

function match<TKey extends PropertyKey, TResult>(
	value: TKey,
	cases: MatchCases<TKey, TResult>,
): TResult

function match<
	TValue extends Record<TDiscriminant, PropertyKey>,
	TDiscriminant extends keyof TValue,
	TResult,
>(
	value: TValue,
	discriminant: TDiscriminant,
	cases: DiscriminatedMatchCases<TValue, TDiscriminant, TResult>,
): TResult

function match<
	TValue extends Record<TDiscriminant, PropertyKey>,
	TDiscriminant extends keyof TValue,
	TResult,
>(
	valueOrKey: TValue | PropertyKey,
	discriminantOrCases: TDiscriminant | MatchCases<PropertyKey, TResult>,
	maybeCases?: DiscriminatedMatchCases<TValue, TDiscriminant, TResult>,
): TResult {
	if (maybeCases === undefined) {
		const value = valueOrKey as PropertyKey
		const cases = discriminantOrCases as MatchCases<PropertyKey, TResult>
		const selected = cases[value] as LazyValue<TResult>

		return resolveLazyValue(selected)
	}

	const value = valueOrKey as TValue
	const discriminant = discriminantOrCases as TDiscriminant
	const cases = maybeCases
	const key = value[discriminant] as TValue[TDiscriminant] & PropertyKey
	const selected = cases[key] as MatchBranchValue<TResult, TValue>

	return resolveMatchBranchValue(selected, value)
}

function matchOr<TKey extends PropertyKey, TResult>(
	value: TKey,
	cases: Partial<MatchCases<TKey, TResult>>,
	defaultValue: LazyValue<TResult>,
): TResult {
	const selected = cases[value] as LazyValue<TResult> | undefined

	return selected === undefined
		? resolveLazyValue(defaultValue)
		: resolveLazyValue(selected)
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

function resolveMatchBranchValue<TResult, TInput>(
	value: MatchBranchValue<TResult, TInput>,
	input: TInput,
): TResult {
	if (typeof value === 'function') {
		return (value as (input: TInput) => TResult)(input)
	}

	return value
}

export {
	type ChooseBranch,
	type DiscriminatedMatchCases,
	type MatchCases,
	type MatchBranchValue,
	choose,
	match,
	matchOr,
}

ALTER TABLE pos_transactions ALTER COLUMN subtotal TYPE BIGINT USING subtotal::bigint;
ALTER TABLE pos_transactions ALTER COLUMN tax TYPE BIGINT USING tax::bigint;
ALTER TABLE pos_transactions ALTER COLUMN total_amount TYPE BIGINT USING total_amount::bigint;

ALTER TABLE recipes ALTER COLUMN fix_cost TYPE BIGINT USING fix_cost::bigint;
ALTER TABLE recipes ALTER COLUMN basic_cost TYPE BIGINT USING basic_cost::bigint;
ALTER TABLE recipes ALTER COLUMN subtotal TYPE BIGINT USING subtotal::bigint;
ALTER TABLE recipes ALTER COLUMN selling_price TYPE BIGINT USING selling_price::bigint;

ALTER TABLE materials ALTER COLUMN price TYPE BIGINT USING price::bigint;

ALTER TABLE recipe_ingredients ALTER COLUMN amount TYPE BIGINT USING amount::bigint;

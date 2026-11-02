-- Tienda Inteligente P3 — Fases A/B/C
-- Identidad de negocio, catálogo, inventario por lotes, ventas idempotentes
-- y RPC atómica commit_sale (anti-sobreventa + reintentos de red).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Fase A: negocio y terminales (Caja 1 / Caja 2 / laptop)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Mi Tienda',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.terminals (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id IN ('caja-1', 'caja-2', 'laptop')),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id)
);

-- ---------------------------------------------------------------------------
-- Fase B: catálogo e inventario
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  min_stock numeric(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

CREATE INDEX IF NOT EXISTS products_business_idx ON public.products (business_id);

CREATE TABLE IF NOT EXISTS public.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty numeric(14, 3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  exp date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lots_product_idx ON public.lots (product_id);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  terminal_id text NOT NULL,
  cashier_id text,
  total numeric(12, 2) NOT NULL CHECK (total >= 0),
  payment_method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_terminal_fk
    FOREIGN KEY (business_id, terminal_id)
    REFERENCES public.terminals (business_id, id)
);

CREATE INDEX IF NOT EXISTS sales_business_created_idx ON public.sales (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_terminal_idx ON public.sales (business_id, terminal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  lot_id uuid REFERENCES public.lots(id),
  qty numeric(14, 3) NOT NULL CHECK (qty > 0),
  price numeric(12, 2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON public.sale_items (sale_id);

-- ---------------------------------------------------------------------------
-- Fase C: RPC atómica de venta (idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_sale(
  p_sale_uuid uuid,
  p_business_id uuid,
  p_terminal_id text,
  p_cashier_id text,
  p_total numeric,
  p_payment_method text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted uuid;
  v_item jsonb;
  v_lot_id uuid;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_updated integer;
  v_name text;
  v_code text;
BEGIN
  IF p_sale_uuid IS NULL THEN
    RAISE EXCEPTION 'SALE_INVALID: sale_uuid es obligatorio';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'SALE_EMPTY: la venta no tiene partidas';
  END IF;

  -- Reserva el UUID primero. Si ya existe, es un reintento: no descontar stock otra vez.
  INSERT INTO public.sales (
    id, business_id, terminal_id, cashier_id, total, payment_method, created_at
  ) VALUES (
    p_sale_uuid,
    p_business_id,
    p_terminal_id,
    p_cashier_id,
    COALESCE(p_total, 0),
    COALESCE(p_payment_method, 'efectivo'),
    now()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'sale_id', p_sale_uuid
    );
  END IF;

  -- Bloqueo en orden estable para evitar deadlocks entre Caja 1 y Caja 2.
  PERFORM 1
  FROM public.lots
  WHERE id IN (
    SELECT NULLIF(j->>'lot_id', '')::uuid
    FROM jsonb_array_elements(p_items) AS j
    WHERE NULLIF(j->>'lot_id', '') IS NOT NULL
  )
  ORDER BY id
  FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_lot_id := NULLIF(v_item->>'lot_id', '')::uuid;
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric, 0);
    v_price := COALESCE((v_item->>'price')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'SALE_INVALID_QTY: cantidad inválida';
    END IF;

    IF v_lot_id IS NULL THEN
      RAISE EXCEPTION 'SALE_MISSING_LOT: falta lot_id en una partida';
    END IF;

    UPDATE public.lots
    SET qty = qty - v_qty
    WHERE id = v_lot_id
      AND qty >= v_qty;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      SELECT p.name, p.code
        INTO v_name, v_code
      FROM public.products p
      WHERE p.id = v_product_id;

      RAISE EXCEPTION 'STOCK_INSUFFICIENT: existencias insuficientes de % (código %)',
        COALESCE(v_name, 'producto'),
        COALESCE(v_code, 's/c');
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, lot_id, qty, price)
    VALUES (p_sale_uuid, v_product_id, v_lot_id, v_qty, v_price);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'sale_id', p_sale_uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_sale(uuid, uuid, text, text, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_sale(uuid, uuid, text, text, numeric, text, jsonb) TO anon, authenticated;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Políticas abiertas para POS con clave anon. Restringir por JWT/business_id en producción.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'businesses' AND policyname = 'pos_businesses_all') THEN
    CREATE POLICY pos_businesses_all ON public.businesses FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'terminals' AND policyname = 'pos_terminals_all') THEN
    CREATE POLICY pos_terminals_all ON public.terminals FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'pos_products_all') THEN
    CREATE POLICY pos_products_all ON public.products FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lots' AND policyname = 'pos_lots_all') THEN
    CREATE POLICY pos_lots_all ON public.lots FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sales' AND policyname = 'pos_sales_all') THEN
    CREATE POLICY pos_sales_all ON public.sales FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sale_items' AND policyname = 'pos_sale_items_all') THEN
    CREATE POLICY pos_sale_items_all ON public.sale_items FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

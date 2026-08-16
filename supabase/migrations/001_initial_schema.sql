-- MashilTax Database Schema
-- Applied to Supabase project: mdczwitgaivbpbkcsswn (ap-southeast-1)

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name text NOT NULL,
  ic_number text NOT NULL,
  tin text,
  email text,
  phone text,
  address text,
  spouse_name text,
  spouse_ic text,
  spouse_tin text,
  children_info jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE income_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  gross_income numeric(12,2) DEFAULT 0,
  current_debtor numeric(12,2) DEFAULT 0,
  inp_opd numeric(12,2) DEFAULT 0,
  staff_medical numeric(12,2) DEFAULT 0,
  write_off_income numeric(12,2) DEFAULT 0,
  debtor_payment numeric(12,2) DEFAULT 0,
  management_fee numeric(12,2) DEFAULT 0,
  write_off_expense numeric(12,2) DEFAULT 0,
  cc_commission numeric(12,2) DEFAULT 0,
  adj_staff_medical numeric(12,2) DEFAULT 0,
  rental numeric(12,2) DEFAULT 0,
  rental_rebate numeric(12,2) DEFAULT 0,
  sst numeric(12,2) DEFAULT 0,
  advance_payment numeric(12,2) DEFAULT 0,
  additional_staff numeric(12,2) DEFAULT 0,
  medical_bills numeric(12,2) DEFAULT 0,
  net_payment numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year, month)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_path text NOT NULL,
  file_name text,
  file_size integer,
  mime_type text,
  document_type text DEFAULT 'unknown',
  merchant text,
  document_date date,
  amount numeric(12,2),
  category text,
  relief_category text,
  description text,
  status text DEFAULT 'pending',
  ocr_confidence numeric(5,2),
  ocr_raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE tax_reliefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tax_year integer NOT NULL,
  relief_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_relief numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tax_year)
);

CREATE TABLE annual_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tax_year integer NOT NULL,
  annual_income numeric(12,2) DEFAULT 0,
  total_reliefs numeric(12,2) DEFAULT 0,
  chargeable_income numeric(12,2) DEFAULT 0,
  tax_payable numeric(12,2) DEFAULT 0,
  zakat numeric(12,2) DEFAULT 0,
  cp500 numeric(12,2) DEFAULT 0,
  be_worksheet jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tax_year)
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_reliefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "income_select" ON income_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "income_insert" ON income_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "income_update" ON income_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "income_delete" ON income_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "documents_select" ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "documents_insert" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents_update" ON documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "documents_delete" ON documents FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "reliefs_select" ON tax_reliefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "reliefs_insert" ON tax_reliefs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reliefs_update" ON tax_reliefs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "reliefs_delete" ON tax_reliefs FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "annual_select" ON annual_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "annual_insert" ON annual_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "annual_update" ON annual_records FOR UPDATE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_profiles_ic ON profiles(ic_number);
CREATE INDEX idx_income_user_ym ON income_records(user_id, year, month);
CREATE INDEX idx_documents_user ON documents(user_id, created_at DESC);
CREATE INDEX idx_documents_user_type ON documents(user_id, document_type);
CREATE INDEX idx_reliefs_user_year ON tax_reliefs(user_id, tax_year);
CREATE INDEX idx_annual_user_year ON annual_records(user_id, tax_year);

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_income_updated BEFORE UPDATE ON income_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reliefs_updated BEFORE UPDATE ON tax_reliefs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_annual_updated BEFORE UPDATE ON annual_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

CREATE POLICY "storage_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

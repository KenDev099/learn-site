// 第 6 課判分用的共用工具（不用改這個檔）
import { createHash } from 'node:crypto'
import { applySql, slugOf, stack, taskSchema } from '../../helpers/supa.ts'

// 學習者的函式收到的設定：像伺服器的環境變數，兩把 key 都在，但不是每段程式都該用
export type Config = { url: string, publishableKey: string, secretKey: string, schema: string, mailpitUrl: string }

export function configFor(schema: string, url = stack().API_URL): Config {
  const { PUBLISHABLE_KEY, SECRET_KEY, MAILPIT_URL } = stack()
  return { url, publishableKey: PUBLISHABLE_KEY, secretKey: SECRET_KEY, schema, mailpitUrl: MAILPIT_URL }
}

// 第 4 課的 orders：顧客只讀得到自己的訂單
export async function ordersSchema(dir: string): Promise<string> {
  const schema = await taskSchema(dir)
  await applySql(schema, `
    create table orders (
      id integer generated always as identity primary key,
      customer_id uuid not null references auth.users (id) on delete cascade,
      total integer not null
    );
    alter table orders enable row level security;
    create policy "顧客讀自己的訂單" on orders for select to authenticated using (customer_id = (select auth.uid()));
    grant select on orders to authenticated, service_role;`)
  return schema
}

// 學習者照正式專案的寫法寫 public.xxx、create trigger xxx …；判分時換成這一題專屬的名字：
//   public. → t_<slug>.；trigger 名稱加上這一題的代號；trigger 只對這一題的測試帳號（<slug>-…@learn.test）觸發，不影響同時在跑的其他題目
export function localize(text: string, dir: string, schema: string): string {
  const slug = slugOf(dir)
  const tag = createHash('md5').update(slug).digest('hex').slice(0, 8)
  if (!/for\s+each\s+row\s+execute\s+(function|procedure)/i.test(text)) throw new Error('找不到 create trigger … after insert on auth.users for each row execute function …：trigger 要寫在 profiles.sql 裡')
  return text
    .replace(/\bpublic\./gi, `${schema}.`)
    .replace(/create\s+trigger\s+("?)(\w+)\1/gi, `create trigger "$2_${tag}"`)
    .replace(/for\s+each\s+row\s+execute/gi, `for each row when (new.email like '${slug}-%') execute`)
}

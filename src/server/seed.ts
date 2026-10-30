import sharp from 'sharp';
import { audit } from './audit';
import { calcFee, calcPrice, newId, type Ctx } from './core';
import { codeFingerprint, encryptCode, hashPassword, sha256 } from './crypto';
import type { Database } from './db';
import { moveBalance } from './ledger';
import { notify } from './mail';
import { DEFAULT_SETTINGS, saveSettings } from './settings';
import { storeImage } from './storage';

/** Development / client-demo data. Runs only when AUTO_SEED=true and the database is empty. */

const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomGiftCode = () => 'X' + Array.from({ length: 15 }, () => A[Math.floor(Math.random() * A.length)]).join('');

async function sampleIdImage(name: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ecfdf5"/><stop offset="1" stop-color="#d1fae5"/></linearGradient></defs>
  <rect width="900" height="560" rx="30" fill="url(#g)"/><rect width="900" height="86" rx="30" fill="#059669"/><text x="40" y="58" font-size="36" fill="#fff" font-family="sans-serif">運転免許証（サンプル）</text>
  <rect x="620" y="130" width="230" height="290" rx="12" fill="#a7f3d0"/><circle cx="735" cy="235" r="56" fill="#6ee7b7"/><rect x="665" y="300" width="140" height="100" rx="40" fill="#6ee7b7"/>
  <text x="44" y="180" font-size="30" font-family="sans-serif" fill="#064e3b">氏名　${name}</text><text x="44" y="245" font-size="30" font-family="sans-serif" fill="#064e3b">生年月日　平成2年4月1日</text>
  <text x="44" y="310" font-size="30" font-family="sans-serif" fill="#064e3b">住所　東京都千代田区○○1-2-3</text><text x="44" y="500" font-size="26" font-family="sans-serif" fill="#dc2626">SAMPLE / 架空データ</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
  return { buf, sha: sha256(buf) };
}

export const seedIfEmpty = (db: Database) => seed(db);

/** Seeds only an empty database; the advisory lock makes concurrent cold starts seed exactly once. */
export async function seed(db: Database) {
  const { rows: existing } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if (existing[0].n > 0) return false;
  const pw = { admin: await hashPassword('admin1234'), demo: await hashPassword('demo1234') };
  return db.tx(async q => {
    await q.query('SELECT pg_advisory_xact_lock(9001)');
    const { rows } = await q.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
    if (rows[0].n > 0) return false;
    await saveSettings(q, DEFAULT_SETTINGS);
    const ctx: Ctx = { actor: null, ip: '127.0.0.1', ua: 'seed' };
    const mk = async (o: { loginId: string; name: string; kana: string; role?: 'admin'; kyc?: 'approved' | 'pending' | 'none'; seller?: 'approved' | 'pending' | 'none'; bank?: [string, string, string] }) => {
      const id = newId('USR');
      const kyc = o.kyc ?? 'approved';
      await q.query(
        `INSERT INTO users (id, login_id, password_hash, name, kana, role, kyc_status, seller_status, seller_applied_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - interval '20 days')`,
        [id, o.loginId, o.role ? pw.admin : pw.demo, o.name, o.kana, o.role ?? 'member', kyc, o.seller ?? 'none', o.seller && o.seller !== 'none' ? new Date() : null]);
      if (kyc !== 'none' && !o.role) {
        const fileId = await storeImage(q, await sampleIdImage(o.name), id, 'kyc');
        await q.query('INSERT INTO kyc_submissions (id, user_id, doc_type, file_id, status, reviewed_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [newId('KYC'), id, '運転免許証', fileId, kyc, kyc === 'approved' ? new Date() : null]);
      }
      if (o.bank) await q.query('INSERT INTO bank_accounts (user_id, bank_name, branch, account_type, account_number, holder) VALUES ($1,$2,$3,$4,$5,$6)', [id, o.bank[0], o.bank[1], '普通', o.bank[2], o.kana]);
      return { id, name: o.name, role: (o.role ?? 'member') as 'admin' | 'member' };
    };
    const admin = await mk({ loginId: 'admin', name: '運営 管理者', kana: 'ウンエイ カンリシャ', role: 'admin' });
    const seller = await mk({ loginId: 'seller', name: '田中 一郎', kana: 'タナカ イチロウ', seller: 'approved', bank: ['三井住友銀行', '新宿支店', '7654321'] });
    const buyer = await mk({ loginId: 'buyer', name: '佐藤 花子', kana: 'サトウ ハナコ' });
    const buyer2 = await mk({ loginId: 'buyer2', name: '鈴木 次郎', kana: 'スズキ ジロウ' });
    const newbie = await mk({ loginId: 'new', name: '高橋 美咲', kana: 'タカハシ ミサキ', kyc: 'pending' });
    await mk({ loginId: 'seller2', name: '伊藤 健', kana: 'イトウ ケン', seller: 'pending' });
    const actx = { ...ctx, actor: admin };

    for (const [u, amt] of [[buyer, 60000], [buyer2, 30000]] as const) {
      const id = newId('CHG');
      await q.query("INSERT INTO charges (id, user_id, amount, received, payer_name, status, reviewed_at, reviewer_id, note) VALUES ($1,$2,$3,$3,$4,'approved',now(),$5,'名義・金額一致')", [id, u.id, amt, u.name, admin.id]);
      await moveBalance(q, u.id, 'charge', amt, 'charge', id);
      await audit(q, actx, 'charge.approve', id, `¥${amt.toLocaleString()}`);
    }
    await q.query("INSERT INTO charges (id, user_id, amount, payer_name) VALUES ($1,$2,10000,'スズキ ジロウ')", [newId('CHG'), buyer2.id]);

    const specs: [number, number, string][] = [[5000, 860, 'sold'], [10000, 880, 'active'], [20000, 895, 'active'], [3000, 850, 'active'], [50000, 900, 'active'], [10000, 875, 'checking']];
    const listingIds: string[] = [];
    for (const [face, rate, status] of specs) {
      const code = randomGiftCode(), enc = encryptCode(code), id = newId('LST');
      listingIds.push(id);
      const checked = status !== 'checking';
      await q.query(
        `INSERT INTO listings (id, seller_id, face, rate_x10, price, code_ct, code_iv, code_tag, key_version, code_head, code_tail, code_fp, status, created_at,
           check_result, check_balance, check_method, check_at, check_staff_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now() - interval '5 hours', $14,$15,$16,$17,$18)`,
        [id, seller.id, face, rate, calcPrice(face, rate), enc.ct, enc.iv, enc.tag, enc.keyVersion, code.slice(0, 4), code.slice(-4), codeFingerprint(code), status,
          checked ? 'ok' : null, checked ? face : null, checked ? 'Apple公式サイトで残高照会' : null, checked ? new Date(Date.now() - 4 * 3600e3) : null, checked ? admin.id : null]);
      await audit(q, { ...ctx, actor: seller }, 'listing.create', id, `額面 ¥${face.toLocaleString()}`);
    }
    // one completed historical trade so the sales / payout screens have data
    const price = calcPrice(5000, 860), fee = calcFee(price, DEFAULT_SETTINGS.feeBps), tid = newId('TRD');
    await q.query(`INSERT INTO trades (id, listing_id, buyer_id, seller_id, face, rate_x10, price, fee, seller_net, status, purchased_at, deadline, completed_at, completed_by)
      VALUES ($1,$2,$3,$4,5000,860,$5,$6,$7,'completed', now() - interval '3 hours', now() - interval '150 minutes', now() - interval '170 minutes', 'buyer')`,
      [tid, listingIds[0], buyer.id, seller.id, price, fee, price - fee]);
    await moveBalance(q, buyer.id, 'charge', -price, 'purchase', tid);
    await moveBalance(q, seller.id, 'sales', price - fee, 'sale', tid, `手数料 ¥${fee} 控除後`);
    await audit(q, { ...ctx, actor: buyer }, 'trade.purchase', tid);
    await audit(q, { ...ctx, actor: buyer }, 'trade.complete', tid, '買い手の受取確認');
    await notify(q, { userId: newbie.id }, 'kyc_submit', '本人確認書類を受け付けました', `${newbie.name} 様\n\n本人確認書類を受け付けました。`);
    await audit(q, ctx, 'system.seed', 'database', 'デモデータを作成');
    return true;
  });
}

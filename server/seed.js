require('dotenv').config();
const { sql, getPool } = require('./db');

function randomInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function randomPhone(){ return '+1' + (1000000000 + randomInt(0, 899999999)).toString(); }

async function run() {
  const pool = await getPool();
  await pool.request().query('DELETE FROM Ads; DELETE FROM Leads;');
  const campaigns = ['Alpha','Beta','Gamma'];
  const days = 90;
  const now = new Date();

  const insertAd = async (campaign, dateChar, leads, spend, actionsJson) => {
    await pool.request()
      .input('campaign', sql.NVarChar, campaign)
      .input('dateChar', sql.Char(10), dateChar)
      .input('leads', sql.Int, leads)
      .input('spend', sql.Decimal(18,2), spend)
      .input('actionsJson', sql.NVarChar, JSON.stringify(actionsJson))
      .query('INSERT INTO Ads (Campaign, DateChar, Leads, Spend, ActionsJson) VALUES (@campaign, @dateChar, @leads, @spend, @actionsJson)');
  };

  const insertLead = async (name, phone, timeUtc, dateChar, campaign) => {
    await pool.request()
      .input('name', sql.NVarChar, name)
      .input('phone', sql.NVarChar, phone)
      .input('time', sql.DateTime2, timeUtc)
      .input('dateChar', sql.Char(10), dateChar)
      .input('campaign', sql.NVarChar, campaign)
      .query('INSERT INTO Leads (Name, Phone, TimeUtc, DateChar, Campaign) VALUES (@name, @phone, @time, @dateChar, @campaign)');
  };

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(now.getDate() - d);
    const dateStr = date.toISOString().slice(0,10);

    for (const c of campaigns) {
      const leads = Math.max(0, Math.round(3 + Math.random() * 25));
      const spend = Number((Math.random() * 200).toFixed(2));
      const actions = {
        link_click: randomInt(50,450),
        view_content: randomInt(20,320),
        add_to_cart: randomInt(0,40),
        purchase: randomInt(0,10)
      };
      await insertAd(c, dateStr, leads, spend, actions);
      for (let i=0;i<leads;i++) {
        const name = `Lead ${randomInt(100,9999)}`;
        const phone = randomPhone();
        const t = new Date(date.getTime() + randomInt(0, 1000*60*60*23));
        await insertLead(name, phone, t.toISOString(), dateStr, c);
      }
    }
  }

  console.log('Seeding done');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });

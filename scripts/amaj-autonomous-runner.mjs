#!/usr/bin/env node
/**
 * اسکریپت مستقل ابری ربات مشتری‌یاب شرکت بسته‌بندی آماج (شهرک صنعتی خوارزمی ماهدشت)
 * قابل اجرا در GitHub Actions هر ۲ ساعت بدون نیاز به روشن بودن کامپیوتر
 * - شماره‌گذاری سه‌رقمی کارت‌ها از 001 به بالا (001, 002, ..., 010, ...)
 * - ارسال فوری هر مشتری در قالب یک کارت مجزا با فاصله‌گذاری خوانا در گروه بله
 * - تضمین حداقل ۱۰ کارت در هر نوبت کاوش
 */

import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const STATE_PATH = path.resolve(process.cwd(), 'data/amaj_state.json');
const DEFAULT_BALE_TOKEN =
  process.env.BALE_BOT_TOKEN || '1764297593:7TEUWgIAZTZGVmZALmmLM-OBS5D7LudrLmU';
const DEFAULT_BALE_CHAT_ID =
  process.env.BALE_CHAT_ID || '5768516925';

const ZONES = [
  {
    id: 'zone-1-mahdasht',
    order: 1,
    title: 'ماهدشت و شهرک‌های صنعتی خوارزمی و سرداران (مبدأ آماج)',
    avgRoadDistanceKm: 6,
    query: 'شرکت های تولیدی فعال شهرک صنعتی خوارزمی ماهدشت و سرداران صنایع غذایی دارویی آرایشی شوینده شماره تماس آدرس'
  },
  {
    id: 'zone-2-karaj',
    order: 2,
    title: 'کرج، مهرشهر، محمدشهر و کمالشهر (شهرک صنعتی بهارستان و قزلحصار)',
    avgRoadDistanceKm: 24,
    query: 'کارخانه و تولیدی شهرک صنعتی بهارستان کرج کمالشهر محمدشهر صنایع غذایی خشکبار عسل آرایشی شماره تماس'
  },
  {
    id: 'zone-3-eshtehard',
    order: 3,
    title: 'اشتهارد و شهرک صنعتی اشتهارد',
    avgRoadDistanceKm: 48,
    query: 'شرکت های تولیدی فعال شهرک صنعتی اشتهارد صنایع غذایی شوینده آرایشی دارویی شماره تماس کارخانه'
  },
  {
    id: 'zone-4-nazarabad',
    order: 4,
    title: 'نظرآباد، هشتگرد و ساوجبلاغ (شهرک صنعتی سپهر و نظرآباد)',
    avgRoadDistanceKm: 58,
    query: 'کارخانه های شهرک صنعتی سپهر نظرآباد و هشتگرد لبنیات شیرینی شکلات دارویی گیاهی شماره تماس'
  },
  {
    id: 'zone-5-shahriar',
    order: 5,
    title: 'شهریار، ملارد، صفادشت و شهرقدس (گلگون و صفادشت)',
    avgRoadDistanceKm: 32,
    query: 'شرکت های تولیدی شهرک صنعتی صفادشت و گلگون و شهرقدس لوازم خانگی غذایی کیف و کفش چرم شماره تماس'
  },
  {
    id: 'zone-6-qazvin',
    order: 6,
    title: 'قزوین، آبیک و شهرک‌های صنعتی کاسپین، لیا و البرز',
    avgRoadDistanceKm: 95,
    query: 'کارخانه های شهرک صنعتی کاسپین آبیک و البرز قزوین و لیا صنایع شوینده غذایی خشکبار شماره تماس'
  },
  {
    id: 'zone-7-tehran',
    order: 7,
    title: 'تهران و شهرک‌های صنعتی غرب و جنوب تهران (شمس‌آباد، نصیرآباد، پرند، عباس‌آباد)',
    avgRoadDistanceKm: 65,
    query: 'تولیدکنندگان عطر ادکلن چرم جواهرات و کارخانه های شهرک صنعتی شمس آباد و نصیرآباد نیازمند جعبه هاردباکس کارتن لمینیتی تماس'
  },
  {
    id: 'zone-8-provinces',
    order: 8,
    title: 'سایر استان‌ها به ترتیب فاصله و ظرفیت بازار (ساوه/کاوه، قم/شکوهیه، اصفهان، تبریز، مشهد)',
    avgRoadDistanceKm: 240,
    query: 'کارخانه های شهرک صنعتی کاوه ساوه شکوهیه قم سلیمی تبریز توس مشهد صنایع غذایی شیرینی شکلات زعفران چرم شماره تماس'
  }
];

function formatCardCode(num) {
  return String(Math.max(1, Math.floor(num))).padStart(3, '0');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFingerprint(name, city) {
  return `${String(name || '').trim()}_${String(city || '').slice(0, 20).trim()}`
    .replace(/\s+/g, '')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/شرکت|کارخانه|تولیدی|گروه|صنعتی|بستهبندی|بسته‌بندی/g, '')
    .toLowerCase();
}

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading state file:', err);
  }
  return {
    config: {
      activeZoneIndex: 0,
      lastDailyUpdateDate: '',
      minCardsPerCycle: 10
    },
    leads: [],
    seenFingerprints: [],
    cycleReports: [],
    dailyUpdates: []
  };
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * فرمت خوانا، با فاصله‌گذاری استاندارد و شماره‌گذاری سه‌رقمی (از 001) برای پیام‌رسان بله
 */
function formatLeadCard(lead, fallbackNumber) {
  const code =
    lead.cardCode ||
    formatCardCode(lead.cardNumber || fallbackNumber || 1);

  const priorityBadge =
    lead.salesPriority === 'A+'
      ? '🔥 A+ (فوری / تیراژ بالا)'
      : lead.salesPriority === 'A'
      ? '⭐ A (اولویت بالا)'
      : '📌 B (اولویت پیگیری)';

  return [
    `╔══════════════════════╗`,
    `📦 کارت مشتری آماج  |  کد #${code}`,
    `╚══════════════════════╝`,
    ``,
    `🏢 نام شرکت یا سفارش‌دهنده:`,
    `» ${lead.companyName}`,
    ``,
    `📍 شهر و آدرس:`,
    `» ${lead.cityAndAddress}`,
    `🛣 فاصله از کارخانه آماج (ماهدشت): ~${lead.roadDistanceKm} کیلومتر`,
    ``,
    `──────────────────────`,
    ``,
    `🏭 محصول یا صنعت فعالیت:`,
    `» ${lead.industryOrProduct}`,
    ``,
    `🎯 محصول موردنیاز از آماج:`,
    `» ${lead.amajProductNeeded}`,
    ``,
    `🏆 اولویت فروش:  ${priorityBadge}`,
    ``,
    `📊 وضعیت نیاز:  ${lead.demandStatus}`,
    ``,
    `──────────────────────`,
    ``,
    `📞 شماره تماس عمومی یا کاری:`,
    `${lead.publicPhone || 'در منبع عمومی درج نشده'}`,
    ``,
    `👤 مدیرعامل / مدیر خرید یا بازرگانی:`,
    `${lead.decisionMaker || 'در منبع عمومی تأیید نشده'}`,
    ``,
    `──────────────────────`,
    ``,
    `💡 تحلیل و شواهد نیاز:`,
    `${lead.demandEvidence}`,
    ``,
    `🚦 وضعیت فعالیت واحد:  ${lead.activityStatus}`,
    ``,
    `🔗 لینک منبع اطلاعات:`,
    `${lead.sourceUrl}`
  ].join('\n');
}

async function autoDiscoverBaleChatId(token) {
  if (!token) return '';
  try {
    const res = await fetch(`https://tapi.bale.ai/bot${token}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 })
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.result)) return '';
    for (const upd of data.result.reverse()) {
      const chat =
        upd?.message?.chat ||
        upd?.channel_post?.chat ||
        upd?.my_chat_member?.chat;
      if (chat && chat.id !== undefined) {
        return String(chat.id);
      }
    }
  } catch (e) {
    console.warn('Could not auto-discover Bale chat_id:', e);
  }
  return '';
}

async function sendMessengerMessage(apiBase, token, chatId, text) {
  if (!token) return false;
  let targetChatId = chatId;
  if (!targetChatId && apiBase.includes('bale.ai')) {
    targetChatId = await autoDiscoverBaleChatId(token);
  }
  if (!targetChatId) return false;
  const url = `${apiBase}/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChatId,
      text,
      disable_web_page_preview: true
    })
  });
  return res.ok;
}

async function discoverLeadsForZone(ai, zone, existingNames, countNeeded) {
  const prompt = `
تو ربات هوشمند کشف مشتریان B2B برای «شرکت بسته‌بندی آماج» (واقع در شهرک صنعتی خوارزمی ماهدشت) هستی.
مأموریت فعلی: جستجوی واقعی در وب فارسی برای یافتن حداقل ${countNeeded} شرکت، کارخانه یا برند تولیدی واقعی و جدید در حلقه جغرافیایی زیر:
حلقه فعلی: «${zone.title}»
کلیدواژه جستجو: ${zone.query}

سه محصول اصلی شرکت آماج:
1. «کارتن و جعبه لمینیتی» (صنایع غذایی، شوینده، آرایشی، دارویی، لوازم خانگی و تولیدکنندگان صنعتی)
2. «هاردباکس» (پوشاک، کیف و کفش، چرم، عطر و ادکلن، جواهرات، ساعت، هدایای لوکس)
3. «لیبل دیجیتال تیراژ پایین» (تولیدکنندگان کوچک، برندهای نوپا، عسل، ادویه، خشکبار، آرایشی‌بهداشتی، کارگاه‌های کم‌تیراژ)

قواعد حیاتی و غیرقابل نقض:
- هرگز شرکت تکراری از این لیست معرفی نکن: [${existingNames || 'هنوز شرکتی ثبت نشده'}]
- هرگز شماره تلفن نساز و حدس نزن! فقط اگر شماره تلفن واقعی در منبع عمومی وجود دارد بنویس، در غیر این صورت دقیقاً بنویس: «در منبع عمومی درج نشده».
- بین کسی که واقعاً آگهی/درخواست خرید منتشر کرده («درخواست منتشرشده» یا «خریدار تأییدشده») و تولیدکننده‌ای که به خاطر محصولش نیاز به بسته‌بندی دارد («مشتری بالقوه») به دقت تفاوت بگذار.
- خروجی را فقط و فقط به صورت یک آرایه JSON معتبر شامل ${countNeeded} شرکت واقعی برگردان:
[
  {
    "companyName": "نام دقیق شرکت یا برند",
    "cityAndAddress": "شهر، شهرک صنعتی و آدرس دقیق",
    "industryOrProduct": "محصول تولیدی یا صنعت فعالیت",
    "publicPhone": "شماره تلفن واقعی از منبع یا عبارت: در منبع عمومی درج نشده",
    "decisionMaker": "نام مدیرعامل یا مدیر خرید در صورت وجود در منبع یا عبارت: در منبع عمومی تأیید نشده",
    "amajProductNeeded": "کارتن و جعبه لمینیتی | هاردباکس | لیبل دیجیتال تیراژ پایین",
    "salesPriority": "A+ | A | B",
    "sourceUrl": "لینک واقعی منبع وب",
    "sourceTitle": "نام سایت یا مرجع",
    "sourceChannel": "نیازمندی‌ها و آگهی‌های صنعتی | دایرکتوری شهرک‌های صنعتی و کارخانجات | وب‌سایت رسمی و استعلام مناقصات | اینستاگرام و تلگرام برندهای تولیدی",
    "demandStatus": "خریدار تأییدشده | درخواست منتشرشده | مشتری بالقوه",
    "demandEvidence": "توضیح دقیق علت نیاز به بسته‌بندی آماج",
    "activityStatus": "فعال و دایر | هشدار: نیازمند استعلام وضعیت فعالیت"
  }
]
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const rawText = response.text || '[]';
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const fallbackGroundedUrl =
    groundingChunks.find((c) => c.web?.uri)?.web?.uri ||
    'https://www.google.com/search?q=' + encodeURIComponent(zone.query);

  let parsed = [];
  try {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      parsed = JSON.parse(match[0]);
    }
  } catch (e) {
    console.warn('Could not parse JSON directly:', e);
  }
  return { parsed, fallbackGroundedUrl };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY در متغیرهای محیطی یا GitHub Secrets تنظیم نشده است.');
  }

  const state = loadState();
  const today = new Date().toISOString().slice(0, 10);

  if (state.config?.lastDailyUpdateDate !== today) {
    state.config = state.config || {};
    state.config.lastDailyUpdateDate = today;
    state.dailyUpdates = state.dailyUpdates || [];
    state.dailyUpdates.unshift({
      date: today,
      updatedAt: new Date().toISOString(),
      addedKeywords: ['مناقصه خرید کارتن لمینیتی ۱۴۰۵', 'استعلام قیمت هاردباکس', 'چاپ لیبل دیجیتال تیراژ کم'],
      marketFocusNote: `به‌روزرسانی خودکار روزانه بانک کلیدواژه‌ها و پایش شهرک‌های صنعتی از مبدأ ماهدشت (${today})`,
      activeZonesCount: ZONES.length,
      totalDeduplicatedFingerprints: (state.seenFingerprints || []).length
    });
  }

  const minCards = Math.max(10, Number(state.config?.minCardsPerCycle) || 10);
  const startZoneIndex = process.env.ZONE_OVERRIDE
    ? Math.max(0, Math.min(ZONES.length - 1, Number(process.env.ZONE_OVERRIDE) - 1))
    : (state.config?.activeZoneIndex || 0) % ZONES.length;

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  const tgToken = process.env.TELEGRAM_BOT_TOKEN || state.config?.telegramBotToken;
  const tgChat = process.env.TELEGRAM_CHAT_ID || state.config?.telegramChatId;
  const baleToken = process.env.BALE_BOT_TOKEN || state.config?.baleBotToken || DEFAULT_BALE_TOKEN;
  let baleChat = process.env.BALE_CHAT_ID || state.config?.baleChatId || DEFAULT_BALE_CHAT_ID;
  if (!baleChat && baleToken) {
    baleChat = await autoDiscoverBaleChatId(baleToken);
    if (baleChat) {
      state.config = state.config || {};
      state.config.baleChatId = baleChat;
    }
  }

  const seenSet = new Set(state.seenFingerprints || []);
  const newLeads = [];
  let duplicatesSkipped = 0;

  // محاسبه شماره کارت بعدی (از 001 به بالا)
  let nextCardNumber =
    (state.leads || []).reduce((max, l) => Math.max(max, Number(l.cardNumber) || 0), 0) + 1;
  if (nextCardNumber <= (state.leads || []).length) {
    nextCardNumber = (state.leads || []).length + 1;
  }

  // اجرای کاوش در حلقه‌های جغرافیایی تا رسیدن به حداقل ۱۰ کارت در این نوبت
  for (let pass = 0; pass < 2 && newLeads.length < minCards; pass++) {
    const currentZone = ZONES[(startZoneIndex + pass) % ZONES.length];
    const existingNames = [...newLeads, ...(state.leads || [])]
      .slice(0, 90)
      .map((l) => l.companyName)
      .join('، ');
    const needed = Math.max(6, minCards - newLeads.length + 2);

    const { parsed, fallbackGroundedUrl } = await discoverLeadsForZone(
      ai,
      currentZone,
      existingNames,
      needed
    );

    for (const item of parsed) {
      if (newLeads.length >= minCards) break;
      if (!item?.companyName || !item?.cityAndAddress) continue;
      const fp = normalizeFingerprint(item.companyName, item.cityAndAddress);
      if (seenSet.has(fp)) {
        duplicatesSkipped++;
        continue;
      }
      seenSet.add(fp);

      const cardNum = nextCardNumber++;
      const cardCode = formatCardCode(cardNum);

      const lead = {
        id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        cardNumber: cardNum,
        cardCode,
        fingerprint: fp,
        companyName: item.companyName,
        cityAndAddress: item.cityAndAddress,
        zoneId: currentZone.id,
        zoneName: currentZone.title,
        roadDistanceKm: currentZone.avgRoadDistanceKm,
        industryOrProduct: item.industryOrProduct || 'تولیدی صنعتی',
        publicPhone: item.publicPhone || 'در منبع عمومی درج نشده',
        decisionMaker: item.decisionMaker || 'در منبع عمومی تأیید نشده',
        amajProductNeeded: item.amajProductNeeded || 'کارتن و جعبه لمینیتی',
        salesPriority: ['A+', 'A', 'B'].includes(item.salesPriority) ? item.salesPriority : 'A',
        sourceUrl:
          item.sourceUrl && item.sourceUrl.startsWith('http')
            ? item.sourceUrl
            : fallbackGroundedUrl,
        sourceTitle: item.sourceTitle || 'جستجوی زنده وب',
        sourceChannel: item.sourceChannel || 'دایرکتوری شهرک‌های صنعتی و کارخانجات',
        demandStatus: item.demandStatus || 'مشتری بالقوه',
        demandEvidence: item.demandEvidence || 'تولیدکننده فعال نیازمند ملزومات بسته‌بندی',
        activityStatus: item.activityStatus || 'فعال و دایر',
        crmStatus: 'جدید',
        discoveredAt: new Date().toISOString(),
        cycleId: `cycle-${Date.now()}`,
        dispatchedToTelegram: false,
        dispatchedToBale: false
      };

      // ارسال فوری هر کارت به محض پیدا شدن به گروه بله و تلگرام
      const singleCardMessage = formatLeadCard(lead, cardNum);
      if (baleToken && baleChat) {
        lead.dispatchedToBale = await sendMessengerMessage(
          'https://tapi.bale.ai',
          baleToken,
          baleChat,
          singleCardMessage
        );
        await sleep(450);
      }
      if (tgToken && tgChat) {
        lead.dispatchedToTelegram = await sendMessengerMessage(
          'https://api.telegram.org',
          tgToken,
          tgChat,
          singleCardMessage
        );
      }

      newLeads.push(lead);
    }
  }

  state.seenFingerprints = Array.from(seenSet);
  state.leads = [...newLeads, ...(state.leads || [])].slice(0, 500);
  state.config.activeZoneIndex = (startZoneIndex + 1) % ZONES.length;

  const primaryZone = ZONES[startZoneIndex];
  if (newLeads.length === 0) {
    const zeroReportText = [
      `📭 گزارش دو ساعته ربات مشتری‌یاب آماج (گزارش صفر)`,
      ``,
      `📍 حلقه بررسی‌شده: ${primaryZone.title}`,
      `⏱ زمان: ${new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}`,
      ``,
      `✅ نتیجه: در این چرخه مشتری جدید معتبری خارج از فهرست قبلی یافت نشد (${duplicatesSkipped} مورد تکراری فیلتر شد). طبق قانون سیستم، از ارسال مجدد فهرست قدیمی خودداری شد.`
    ].join('\n');
    await sendMessengerMessage('https://tapi.bale.ai', baleToken, baleChat, zeroReportText);
    await sendMessengerMessage('https://api.telegram.org', tgToken, tgChat, zeroReportText);
  }

  saveState(state);
  console.log(`Cycle complete. Dispatched ${newLeads.length} individual numbered cards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

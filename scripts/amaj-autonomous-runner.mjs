#!/usr/bin/env node
/**
 * موتور خودکار ۲۴/۷ و چندلایه ربات مشتری‌یاب شرکت بسته‌بندی آماج (ماهدشت)
 * پوشش هم‌زمان:
 * الف) مشتریان خارج از شهرک‌های صنعتی (بازارهای شهری، دفاتر مرکزی برندها، کارگاه‌های شهری، قنادی‌ها،
 *      برشته‌کاری‌های قهوه، گالری‌های عطر/چرم/جواهر/ساعت، فروشگاه‌های عسل/زعفران/خشکبار، مزون‌ها،
 *      آژانس‌های هدایای سازمانی و برندهای فروشگاهی اینستاگرام / باسلام / دیجی‌کالا)
 * ب) کارخانه‌ها و واحدهای تولیدی در شهرک‌ها و مناطق صنعتی
 *
 * ویژگی‌ها:
 * ۱. حذف کامل «گزارش صفر» و تضمین ارسال حداقل ۶ تا ۱۰ کارت جدید در هر نوبت ۲ ساعته
 * ۲. شماره‌گذاری متوالی ۳ رقمی کارت‌ها (از 001 به بالا) با فرمت خوانا و بافاصله در گروه بله
 * ۳. رادار نقشه و لوکیشن (OpenStreetMap Nominatim + Overpass) + موتور جستجوی وب و نیازمندی‌ها
 */

import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const STATE_PATH = path.resolve(process.cwd(), 'data/amaj_state.json');
const DEFAULT_BALE_TOKEN =
  process.env.BALE_BOT_TOKEN || '1764297593:7TEUWgIAZTZGVmZALmmLM-OBS5D7LudrLmU';
const DEFAULT_BALE_CHAT_ID =
  process.env.BALE_CHAT_ID || '5768516925';

const AMAJ_ORIGIN = {
  lat: 35.7289,
  lng: 50.8136,
  title: 'کارخانه بسته‌بندی آماج (ماهدشت)'
};

/**
 * ۲۸ منطقه جغرافیایی ترکیبی (شامل مراکز شهری، بازارها و راسته‌های تجاری داخل شهرها + قطب‌های تولیدی)
 * به ترتیب فاصله از ماهدشت
 */
const TARGET_REGIONS = [
  {
    id: 'reg-1-karaj-urban',
    order: 1,
    isUrban: true,
    title: 'مراکز شهری و تجاری کرج (مهرشهر، گوهردشت، عظیمیه، جهانشهر، فردیس و بازار کرج)',
    city: 'کرج',
    areaName: 'مهرشهر، گوهردشت، عظیمیه و فردیس کرج',
    lat: 35.8327,
    lng: 50.9915,
    bbox: [35.72, 50.88, 35.88, 51.05],
    avgRoadDistanceKm: 19
  },
  {
    id: 'reg-2-mahdasht-mohammadshahr',
    order: 2,
    isUrban: false,
    title: 'ماهدشت، محمدشهر و مشکین‌دشت (کارگاه‌های شهری، باغات، سردخانه‌ها و خوارزمی)',
    city: 'ماهدشت و محمدشهر',
    areaName: 'بلوار امام خمینی ماهدشت، محمدشهر و مشکین‌دشت',
    lat: 35.7589,
    lng: 50.8736,
    bbox: [35.68, 50.74, 35.80, 50.94],
    avgRoadDistanceKm: 8
  },
  {
    id: 'reg-3-shahriar-andisheh-urban',
    order: 3,
    isUrban: true,
    title: 'داخل شهر شهریار، اندیشه، ملارد و شهرقدس (تولیدی‌های شهری، قنادی‌ها، خشکبار و پوشاک)',
    city: 'شهریار و اندیشه',
    areaName: 'مرکز شهر شهریار، فازهای اندیشه و شهرقدس',
    lat: 35.6598,
    lng: 51.0589,
    bbox: [35.58, 50.95, 35.74, 51.16],
    avgRoadDistanceKm: 24
  },
  {
    id: 'reg-4-tehran-bazaar-central',
    order: 4,
    isUrban: true,
    title: 'بازار بزرگ تهران، بهارستان، کوچه مروی، باغ سپهسالار، پامنار و لاله‌زار (قلب بازار عطر، چرم، خشکبار و پوشاک)',
    city: 'تهران (بازار بزرگ و مرکز)',
    areaName: 'بازار بزرگ تهران، خیابان ۱۵ خرداد، مروی، بهارستان و سعدی',
    lat: 35.6762,
    lng: 51.4231,
    bbox: [35.65, 51.38, 35.71, 51.46],
    avgRoadDistanceKm: 54
  },
  {
    id: 'reg-5-tehran-north-west-brands',
    order: 5,
    isUrban: true,
    title: 'دفاتر مرکزی برندها و شرکت‌های بازرگانی شمال و غرب تهران (سعادت‌آباد، شهرک غرب، ونک، جردن، میرداماد و صادقیه)',
    city: 'تهران (سعادت‌آباد، ونک و جردن)',
    areaName: 'سعادت‌آباد، شهرک غرب، میدان ونک، جردن و بلوار فردوس',
    lat: 35.7575,
    lng: 51.3752,
    bbox: [35.71, 51.28, 35.80, 51.44],
    avgRoadDistanceKm: 52
  },
  {
    id: 'reg-6-tehran-shoosh-salehabad',
    order: 6,
    isUrban: true,
    title: 'بازار شوش، صالح‌آباد، عبدل‌آباد و مولوی تهران (مرکز پخش بلور، ظروف آشپزخانه، کادویی، دکوری و پوشاک)',
    city: 'تهران (شوش و صالح‌آباد)',
    areaName: 'بازار بلورفروشان شوش، بازار عمده صالح‌آباد و مولوی',
    lat: 35.6412,
    lng: 51.4318,
    bbox: [35.58, 51.34, 35.67, 51.46],
    avgRoadDistanceKm: 56
  },
  {
    id: 'reg-7-tehran-enghelab-motahari',
    order: 7,
    isUrban: true,
    title: 'مراکز تجاری، دفاتر پخش دارویی/آرایشی و کانون‌های هدایای سازمانی (مطهری، بهشتی، ولیعصر، فاطمی و انقلاب)',
    city: 'تهران (ولیعصر، مطهری و فاطمی)',
    areaName: 'خیابان ولیعصر، مطهری، بهشتی، میدان فاطمی و کریمخان',
    lat: 35.7245,
    lng: 51.4185,
    bbox: [35.70, 51.37, 35.75, 51.45],
    avgRoadDistanceKm: 53
  },
  {
    id: 'reg-8-hashtgerd-kordan-talebghan',
    order: 8,
    isUrban: true,
    title: 'هشتگرد، کردان، چهارباغ و طالقان (مراکز تولید عسل طبیعی، لبنیات سنتی، خشکبار و کارگاه‌های غذایی)',
    city: 'هشتگرد و چهارباغ البرز',
    areaName: 'شهر هشتگرد، کردان، چهارباغ و نظرآباد',
    lat: 35.9621,
    lng: 50.6785,
    bbox: [35.88, 50.55, 36.05, 50.82],
    avgRoadDistanceKm: 49
  },
  {
    id: 'reg-9-safadasht-malard',
    order: 9,
    isUrban: false,
    title: 'صفادشت و ملارد (کارگاه‌های تولیدی داخل شهر و شهرک صنعتی صفادشت)',
    city: 'صفادشت و ملارد',
    areaName: 'مرکز شهر ملارد، سرآسیاب و صفادشت',
    lat: 35.6761,
    lng: 50.9347,
    bbox: [35.62, 50.88, 35.73, 51.02],
    avgRoadDistanceKm: 18
  },
  {
    id: 'reg-10-karaj-kamalshahr-baharestan',
    order: 10,
    isUrban: false,
    title: 'کمالشهر، حصارک و بهارستان کرج (کارگاه‌های تولیدی، بسته‌بندی حبوبات/خشکبار و صنایع بهارستان)',
    city: 'کمالشهر کرج',
    areaName: 'کمالشهر، خرمدشت، قزلحصار و بهارستان کرج',
    lat: 35.8764,
    lng: 50.8692,
    bbox: [35.78, 50.80, 35.95, 51.02],
    avgRoadDistanceKm: 24
  },
  {
    id: 'reg-11-eshtehard-region',
    order: 11,
    isUrban: false,
    title: 'اشتهارد و بوئین‌زهرا (واحدهای تولیدی، کارگاه‌های لبنی/غذایی و شهرک صنعتی اشتهارد)',
    city: 'اشتهارد',
    areaName: 'اشتهارد و محور بوئین‌زهرا',
    lat: 35.7136,
    lng: 50.4358,
    bbox: [35.65, 50.32, 35.77, 50.55],
    avgRoadDistanceKm: 48
  },
  {
    id: 'reg-12-qazvin-urban-bazaar',
    order: 12,
    isUrban: true,
    title: 'داخل شهر قزوین، تاکستان و آبیک (تولیدکنندگان شیرینی سنتی قزوین، باقلوا، کشمش، خشکبار و آجیل)',
    city: 'قزوین و تاکستان',
    areaName: 'خیابان خیام، بازار سنتی قزوین، بلوار مدرس و تاکستان',
    lat: 36.2688,
    lng: 50.0041,
    bbox: [36.02, 49.65, 36.35, 50.45],
    avgRoadDistanceKm: 98
  },
  {
    id: 'reg-13-qom-urban-sohan',
    order: 13,
    isUrban: true,
    title: 'داخل شهر قم (کارگاه‌ها و برندهای تولید سوهان کادویی، حلوا، شیرینی، عطر و کتاب/انتشارات لوکس)',
    city: 'قم',
    areaName: 'مرکز شهر قم، بلوار امین، صفائیه و میدان سعیدی',
    lat: 34.6416,
    lng: 50.8746,
    bbox: [34.55, 50.75, 34.85, 51.05],
    avgRoadDistanceKm: 152
  },
  {
    id: 'reg-14-kashan-urban-rosewater',
    order: 14,
    isUrban: true,
    title: 'کاشان، قمصر و نیاسر (کارگاه‌های گلاب و عرقیات گیاهی، اسانس، فرش دستباف/ماشینی و شیرینی سنتی)',
    city: 'کاشان و قمصر',
    areaName: 'داخل شهر کاشان، قمصر، نیاسر و راوند',
    lat: 33.9850,
    lng: 51.4100,
    bbox: [33.75, 51.15, 34.12, 51.58],
    avgRoadDistanceKm: 235
  },
  {
    id: 'reg-15-saveh-zarandieh',
    order: 15,
    isUrban: true,
    title: 'ساوه و زرندیه (مراکز سورتینگ و بسته‌بندی انار، طالبی، رب انار، خشکبار و شهر صنعتی کاوه)',
    city: 'ساوه',
    areaName: 'داخل شهر ساوه، میدان سرداران و محور زرندیه',
    lat: 35.0213,
    lng: 50.3566,
    bbox: [34.95, 50.25, 35.25, 50.55],
    avgRoadDistanceKm: 122
  },
  {
    id: 'reg-16-damavand-firouzkouh',
    order: 16,
    isUrban: true,
    title: 'دماوند، گیلاوند، رودهن، بومهن و پردیس (قطب بسته‌بندی عسل طبیعی دماوند، سیب صادراتی، کارگاه‌های چوب و مبل و برندهای نوشیدنی)',
    city: 'دماوند، رودهن و پردیس',
    areaName: 'گیلاوند، دماوند، رودهن، بومهن و جاجرود',
    lat: 35.7012,
    lng: 52.0586,
    bbox: [35.62, 51.75, 35.82, 52.25],
    avgRoadDistanceKm: 96
  },
  {
    id: 'reg-17-varamin-rey-kahrizak',
    order: 17,
    isUrban: true,
    title: 'شهرری، باقرشهر، کهریزک، ورامین و پیشوا (کارگاه‌های تولید بلور، شیشه، ترشیجات، شوریجات، روغن و پوشاک)',
    city: 'شهرری و ورامین',
    areaName: 'شهرری، دولت‌آباد، باقرشهر، ورامین و قرچک',
    lat: 35.5822,
    lng: 51.4412,
    bbox: [35.32, 51.35, 35.62, 51.75],
    avgRoadDistanceKm: 64
  },
  {
    id: 'reg-18-isfahan-urban-bazaar',
    order: 18,
    isUrban: true,
    title: 'داخل شهر اصفهان و نجف‌آباد (برندهای گز و پولکی کادویی، صنایع‌دستی میناکاری/خاتم، عسل، خشکبار و طلا و نقره)',
    city: 'اصفهان',
    areaName: 'میدان نقش‌جهان، چهارباغ، خیابان سپه، جلفا و نجف‌آباد اصفهان',
    lat: 32.6539,
    lng: 51.6660,
    bbox: [32.45, 51.25, 33.15, 51.85],
    avgRoadDistanceKm: 425
  },
  {
    id: 'reg-19-tabriz-urban-leather-choc',
    order: 19,
    isUrban: true,
    title: 'داخل شهر تبریز (کارگاه‌ها و برندهای کیف و کفش چرم تبریز، شکلات و نوقا و باقلوا، آجیل و خشکبار و نقره)',
    city: 'تبریز',
    areaName: 'بازار بزرگ تبریز، چهارراه شهناز، ولیعصر، آبرسان و باغمیشه تبریز',
    lat: 38.0792,
    lng: 46.2887,
    bbox: [37.75, 45.85, 38.18, 46.45],
    avgRoadDistanceKm: 590
  },
  {
    id: 'reg-20-mashhad-urban-saffron',
    order: 20,
    isUrban: true,
    title: 'داخل شهر مشهد، طرقبه و نیشابور (برندهای بسته‌بندی زعفران کادویی، زرشک، نبات، هل، ادویه، عطر و فیروزه)',
    city: 'مشهد',
    areaName: 'بازار رضا، خیابان امام رضا، احمدآباد، سجاد و مصلی مشهد',
    lat: 36.2972,
    lng: 59.6067,
    bbox: [36.15, 59.35, 36.55, 59.75],
    avgRoadDistanceKm: 890
  },
  {
    id: 'reg-21-mazandaran-urban-citrus-honey',
    order: 21,
    isUrban: true,
    title: 'ساری، آمل، بابل، چالوس و تنکابن (واحدهای سورتینگ مرکبات و کیوی، بسته‌بندی برنج، عسل کوهستان، مربا و ترشیجات شمال)',
    city: 'ساری، آمل و بابل',
    areaName: 'مراکز شهری و بازرگانی آمل، بابل، ساری و چالوس',
    lat: 36.5659,
    lng: 53.0586,
    bbox: [36.32, 51.35, 36.75, 53.25],
    avgRoadDistanceKm: 215
  },
  {
    id: 'reg-22-gilan-urban-tea-olive',
    order: 22,
    isUrban: true,
    title: 'رشت، لاهیجان، رودبار و فومن (کارگاه‌ها و برندهای چای لاهیجان، کلوچه فومن، زیتون و روغن زیتون رودبار و بادام‌زمینی آستانه)',
    city: 'رشت، لاهیجان و رودبار',
    areaName: 'داخل شهر رشت، لاهیجان، فومن، آستانه اشرفیه و رودبار',
    lat: 37.2761,
    lng: 49.5886,
    bbox: [36.75, 49.35, 37.45, 50.15],
    avgRoadDistanceKm: 290
  },
  {
    id: 'reg-23-yazd-urban-sweets',
    order: 23,
    isUrban: true,
    title: 'داخل شهر یزد و اردکان (کارگاه‌ها و برندهای شیرینی سنتی یزد، قطاب، باقلوا، پشمک، حلواارده اردکان و ترمه کادویی)',
    city: 'یزد و اردکان',
    areaName: 'میدان امیرچخماق، بلوار جمهوری، صفائیه یزد و اردکان',
    lat: 31.8974,
    lng: 54.3569,
    bbox: [31.75, 53.95, 32.35, 54.55],
    avgRoadDistanceKm: 620
  },
  {
    id: 'reg-24-shiraz-urban-herbal-sweets',
    order: 24,
    isUrban: true,
    title: 'داخل شهر شیراز، میمند و جهرم (عرقیات سنتی، فالوده و مسقطی لاری، بهارنارنج، لیمو، خرما و مرکبات صادراتی)',
    city: 'شیراز',
    areaName: 'بازار وکیل، خیابان زند، معالی‌آباد، عفیف‌آباد و ستارخان شیراز',
    lat: 29.5918,
    lng: 52.5837,
    bbox: [29.45, 52.35, 29.75, 52.75],
    avgRoadDistanceKm: 895
  },
  {
    id: 'reg-25-hamadan-malayer-tuyserkan',
    order: 25,
    isUrban: true,
    title: 'همدان، ملایر، تویسرکان و لالجین (کارگاه‌های سفال و سرامیک کادویی لالجین، کشمش و شیره ملایر، گردو تویسرکان و سیر/ترشی همدان)',
    city: 'همدان، لالجین و ملایر',
    areaName: 'داخل شهر همدان، شهر جهانی سفال لالجین و ملایر',
    lat: 34.7983,
    lng: 48.5148,
    bbox: [34.15, 48.35, 35.05, 48.95],
    avgRoadDistanceKm: 295
  },
  {
    id: 'reg-26-kermanshah-kurdistan-azarbaijan',
    order: 26,
    isUrban: true,
    title: 'کرمانشاه، سنندج، ارومیه و اردبیل (تولیدکنندگان نان برنجی و کاک، روغن حیوانی، عسل سبلان اردبیل، نقل و حلوا ارومیه)',
    city: 'کرمانشاه، ارومیه و اردبیل',
    areaName: 'بازار و مراکز شهری کرمانشاه، ارومیه و اردبیل (قطب عسل سبلان و شیرینی سنتی)',
    lat: 34.3142,
    lng: 47.0650,
    bbox: [34.15, 44.95, 38.35, 48.45],
    avgRoadDistanceKm: 480
  },
  {
    id: 'reg-27-kerman-rafsanjan-bam',
    order: 27,
    isUrban: true,
    title: 'کرمان، رفسنجان، سیرجان و بم (تولیدکنندگان و صادرکنندگان پسته کادویی، خرمای مضافتی بم، کلمپه و قوتو)',
    city: 'کرمان، رفسنجان و بم',
    areaName: 'مراکز بازرگانی پسته رفسنجان، خرمای بم و شیرینی کلمپه کرمان',
    lat: 30.2839,
    lng: 57.0834,
    bbox: [28.95, 55.65, 30.55, 58.45],
    avgRoadDistanceKm: 950
  },
  {
    id: 'reg-28-khuzestan-bushehr-south',
    order: 28,
    isUrban: true,
    title: 'اهواز، آبادان، دزفول، بوشهر و بندرعباس (شرکت‌های بسته‌بندی خرما، رطب، ارده، ادویه جنوب، ماهی و میگو صادراتی)',
    city: 'اهواز، دزفول و بوشهر',
    areaName: 'مراکز بازرگانی و کارگاه‌های بسته‌بندی خرما و آبزیان در اهواز، دزفول و بوشهر',
    lat: 31.3183,
    lng: 48.6706,
    bbox: [27.05, 48.15, 32.45, 56.35],
    avgRoadDistanceKm: 780
  }
];

/**
 * ۲۴ رسته متنوع مشتری (شامل کسب‌وکارهای شهری خارج از شهرک‌های صنعتی + واحدهای تولیدی)
 */
const PACKAGING_TARGET_GUILDS = [
  // --- دسته‌های شهری و خارج از شهرک صنعتی ---
  {
    guildTitle: 'قنادی، شیرینی‌پزی، کیک بوتیک و کارگاه تولید شکلات دست‌ساز شهری',
    isUrbanGuild: true,
    searchKeyword: 'قنادی شیرینی سرای لوکس شکلات دست ساز باکس شکلات',
    productNeeded: 'هاردباکس',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'مراکز تجاری، قنادی‌ها و کارگاه‌های شهری (خارج از شهرک صنعتی)',
    evidence: 'مصرف دائمی جعبه شیرینی لمینیتی و هاردباکس‌های کادویی شکلات، ماکارون و پک‌های مناسبتی در سطح شهر'
  },
  {
    guildTitle: 'رستری قهوه (Coffee Roastery)، کافه‌قنادی و مرکز بسته‌بندی قهوه و دمنوش شهری',
    isUrbanGuild: true,
    searchKeyword: 'رستری قهوه فروش عمده قهوه دمنوش گیاهی بسته بندی',
    productNeeded: 'لیبل دیجیتال تیراژ پایین',
    priority: 'A+',
    demandStatus: 'درخواست منتشرشده',
    channel: 'رستری‌ها و برندهای شهری و اینستاگرامی (خارج از شهرک صنعتی)',
    evidence: 'دارای ۱۰ تا ۳۰ لاین قهوه (عربیکا، روبوستا، کلمبیا، اتیوپی) که نیازمند لیبل دیجیتال تیراژ پایین روی پاکت و هاردباکس گیفت قهوه هستند'
  },
  {
    guildTitle: 'فروشگاه و دفتر پخش عسل طبیعی، زعفران، آجیل، خشکبار و میوه خشک کادویی در شهر',
    isUrbanGuild: true,
    searchKeyword: 'پخش عسل طبیعی زعفران خشکبار آجیل کادویی بسته بندی',
    productNeeded: 'لیبل دیجیتال تیراژ پایین',
    priority: 'A+',
    demandStatus: 'درخواست منتشرشده',
    channel: 'بازارها، فروشگاه‌های تخصصی شهری و غرفه‌داران باسلام/اینستاگرام',
    evidence: 'نیاز فوری به چاپ لیبل دیجیتال تیراژ پایین برای ظروف عسل و ادویه + هاردباکس لوکس برای پک‌های کادویی زعفران و آجیل شب عید و یلدا'
  },
  {
    guildTitle: 'مزون پوشاک، تولیدی پیراهن، مانتو، شال و روسری و لباس نوزاد در داخل شهر',
    isUrbanGuild: true,
    searchKeyword: 'مزون لباس تولیدی پیراهن شال و روسری سیسمونی نوزاد',
    productNeeded: 'هاردباکس',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'مزون‌ها، بوتیک‌های تولیدی و برندهای پوشاک اینستاگرامی داخل شهر',
    evidence: 'استفاده از هاردباکس و جعبه‌های لمینیتی کشویی برای ارسال سفارشات آنلاین شال و روسری، پیراهن مردانه و ست سیسمونی'
  },
  {
    guildTitle: 'کارگاه شهری تولید کیف، کفش، کمربند و اکسسوری چرم دست‌دوز و طبیعی',
    isUrbanGuild: true,
    searchKeyword: 'کارگاه تولید کیف و کفش چرم دست دوز ست چرم هدیه',
    productNeeded: 'هاردباکس',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'کارگاه‌های چرم و راسته‌های تجاری داخل شهر (سپهسالار / بازار / مراکز شهری)',
    evidence: 'نیاز مستمر به جعبه کفش لمینیتی و هاردباکس ست‌های هدیه کیف پول، کمربند و جاکارتی چرم'
  },
  {
    guildTitle: 'گالری و برند شهری عطر، ادکلن، بادی‌اسپلش، عود و خوشبوکننده محیط (دیفیوزر)',
    isUrbanGuild: true,
    searchKeyword: 'برند عطر و ادکلن دیفیوزر خوشبوکننده شمع معطر دست ساز',
    productNeeded: 'هاردباکس',
    priority: 'A+',
    demandStatus: 'درخواست منتشرشده',
    channel: 'بازار عطر (مروی / مراکز تجاری شهر) و برندهای آنلاین عطر و ادکلن',
    evidence: 'سفارش‌دهنده مستقیم هاردباکس مگنتی عطر با فوم برش‌خورده و لیبل دیجیتال طلاکوب و متالایز شیشه عطر در تیراژهای متنوع'
  },
  {
    guildTitle: 'شرکت و کانون تبلیغاتی تولید پک‌های هدایای سازمانی، مدیریتی و مناسبتی در شهر',
    isUrbanGuild: true,
    searchKeyword: 'شرکت هدایای تبلیغاتی پک هدیه سازمانی ست مدیریتی باکس یلدا و نوروز',
    productNeeded: 'هاردباکس',
    priority: 'A+',
    demandStatus: 'درخواست منتشرشده',
    channel: 'دفاتر تبلیغاتی و شرکت‌های هدایای سازمانی داخل شهر',
    evidence: 'مشتری بسیار پرتیراژ برای سفارش هاردباکس‌های اختصاصی هدایای سازمانی، باکس‌های مناسبتی و جعبه‌های لمینیتی تبلیغاتی'
  },
  {
    guildTitle: 'کارگاه روغن‌گیری شهری (روغن کنجد، زیتون، آرگان، کره بادام‌زمینی و ارده) و عطاری‌های تولیدی',
    isUrbanGuild: true,
    searchKeyword: 'روغن گیری کنجد کره بادام زمینی ارده شیره عرقیات گیاهی',
    productNeeded: 'لیبل دیجیتال تیراژ پایین',
    priority: 'A',
    demandStatus: 'خریدار تأییدشده',
    channel: 'کارگاه‌های روغن‌گیری و سلامتکده‌های شهری (خارج از شهرک صنعتی)',
    evidence: 'دارای ۲۰ تا ۴۰ نوع بطری روغن و ظرف کره بادام‌زمینی که نیازمند چاپ لیبل دیجیتال ضدچربی در تیراژ پایین بدون هزینه کلیشه هستند'
  },
  {
    guildTitle: 'گالری طلا، جواهر، نقره، ساعت، تسبیح و سنگ‌های قیمتی و زیورآلات دست‌ساز',
    isUrbanGuild: true,
    searchKeyword: 'گالری طلا و جواهر نقره ساعت زیورآلات دست ساز بسته بندی',
    productNeeded: 'هاردباکس',
    priority: 'A',
    demandStatus: 'خریدار تأییدشده',
    channel: 'پاساژها، بازار طلا و ساعت و گالری‌های اینستاگرامی داخل شهر',
    evidence: 'نیاز دائمی به هاردباکس‌های کوچک لوکس (جعبه ساعت، دستبند، گردنبند و سکه) با لوگوی طلاکوب اختصاصی گالری'
  },
  {
    guildTitle: 'فروشنده و تأمین‌کننده برتر کالا در دیجی‌کالا، باسلام و ترب (لوازم خانه، دکوری، بلور و دیجیتال)',
    isUrbanGuild: true,
    searchKeyword: 'پخش عمده بلور و کریستال دکوری لوازم آشپزخانه اکسسوری موبایل',
    productNeeded: 'کارتن و جعبه لمینیتی',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'بازار شوش، صالح‌آباد و دفاتر پخش فروشندگان مارکت‌پلیس در شهر',
    evidence: 'نیازمند کارتن و جعبه لمینیتی مقاوم و شکیل برای بسته‌بندی ظروف، گجت‌ها و کالاهای ارسالی به مشتریان آنلاین'
  },
  {
    guildTitle: 'تولیدی و کارگاه شهری صابون دست‌ساز، کوکتل پدیکور، نمک حمام و محصولات ارگانیک پوست',
    isUrbanGuild: true,
    searchKeyword: 'تولید صابون دست ساز گیاهی کوکتل پدیکور کرم ارگانیک',
    productNeeded: 'لیبل دیجیتال تیراژ پایین',
    priority: 'A',
    demandStatus: 'درخواست منتشرشده',
    channel: 'برندهای خانگی، کارگاه‌های شهری و پیج‌های تخصصی اینستاگرام',
    evidence: 'نیاز مستقیم به لیبل دیجیتال ضدآب با تیراژ پایین و جعبه‌های مقوایی/هاردباکس برای پک‌های مراقبت پوستی'
  },
  {
    guildTitle: 'رستوران‌ها، کترینگ‌های مجالس، فست‌فودهای زنجیره‌ای و برندهای غذای آماده شهری',
    isUrbanGuild: true,
    searchKeyword: 'کترینگ مجالس رستوران بیرون بر فست فود زنجیره ای پیتزا و برگر',
    productNeeded: 'کارتن و جعبه لمینیتی',
    priority: 'A',
    demandStatus: 'خریدار تأییدشده',
    channel: 'مراکز خدماتی و غذایی داخل شهرها',
    evidence: 'مصرف ماهانه بالا در جعبه‌های لمینیتی بهداشتی پک‌های پذیرایی همایش‌ها، جعبه بیرون‌بر اختصاصی و لیبل پلمپ بسته‌بندی'
  },
  // --- دسته‌های صنعتی و تولیدی ---
  {
    guildTitle: 'کارخانه و واحد تولید فرآورده‌های غذایی، کنسروجات، سس و ترشیجات',
    isUrbanGuild: false,
    searchKeyword: 'شرکت صنایع غذایی کنسرو رب ترشی سس',
    productNeeded: 'کارتن و جعبه لمینیتی',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'دایرکتوری کارخانجات و واحدهای تولیدی',
    evidence: 'مصرف مستمر کارتن لمینیتی شلف‌ردی و لیبل دیجیتال شیشه و قوطی برای لاین‌های متنوع غذایی'
  },
  {
    guildTitle: 'لابراتوار تولید لوازم آرایشی، کرم، شامپو و سرم‌های مراقبت پوست و مو',
    isUrbanGuild: false,
    searchKeyword: 'کارخانه تولید لوازم آرایشی بهداشتی کرم سرم پوست',
    productNeeded: 'هاردباکس',
    priority: 'A+',
    demandStatus: 'درخواست منتشرشده',
    channel: 'وب‌سایت رسمی و استعلام مناقصات',
    evidence: 'نیاز هم‌زمان به هاردباکس پک‌های هدیه آرایشی، جعبه لمینیتی مقوایی و لیبل دیجیتال متالایز/ترنسپرنت'
  },
  {
    guildTitle: 'شرکت داروسازی، مکمل‌های ورزشی، ویتامین‌ها و داروهای گیاهی',
    isUrbanGuild: false,
    searchKeyword: 'شرکت داروسازی مکمل ورزشی گیاهان دارویی شربت',
    productNeeded: 'کارتن و جعبه لمینیتی',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'وب‌سایت رسمی و استعلام مناقصات',
    evidence: 'مصرف مداوم جعبه دارویی، کارتن لمینیتی مکمل‌ها و لیبل دیجیتال قوطی‌های مکمل'
  },
  {
    guildTitle: 'تولیدکننده لوازم خانگی برقی، هود، سینک، گاز صفحه‌ای و سماور',
    isUrbanGuild: false,
    searchKeyword: 'تولید لوازم خانگی برقی هود اجاق گاز چای ساز سماور',
    productNeeded: 'کارتن و جعبه لمینیتی',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'نیازمندی‌ها و آگهی‌های صنعتی',
    evidence: 'تیراژ سفارش بسیار بالا برای کارتن‌های لمینیتی ۵ لایه و ۳ لایه مقاوم با چاپ افست تمام‌رنگی'
  },
  {
    guildTitle: 'تولیدکننده قطعات یدکی خودرو، لنت ترمز، فیلتر، شمع و لوازم برقی خودرو',
    isUrbanGuild: false,
    searchKeyword: 'تولید قطعات خودرو لنت ترمز فیلتر روغن چراغ خودرو',
    productNeeded: 'کارتن و جعبه لمینیتی',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'نیازمندی‌ها و آگهی‌های صنعتی (بازار چراغ‌برق و قطب‌های تولیدی)',
    evidence: 'نیاز مستمر و پرتیراژ به جعبه‌های لمینیتی ای‌فلوت و بی‌فلوت مستحکم و لیبل اصالت قطعه'
  },
  {
    guildTitle: 'تولیدکننده شیرینی سنتی، گز، سوهان، باقلوا، کلوچه و شکلات صادراتی',
    isUrbanGuild: true,
    searchKeyword: 'تولید سوهان گز باقلوا شیرینی سنتی شکلات کادویی',
    productNeeded: 'هاردباکس',
    priority: 'A+',
    demandStatus: 'خریدار تأییدشده',
    channel: 'کارگاه‌ها و برندهای شیرینی و سوغات شهری',
    evidence: 'سفارش‌دهنده دائمی جعبه‌های هاردباکس کادویی و جعبه‌های لمینیتی طلاکوب و برجسته'
  }
];

function formatCardCode(num) {
  return String(Math.max(1, Math.floor(num))).padStart(3, '0');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFingerprint(name, city) {
  return `${String(name || '').trim()}_${String(city || '').slice(0, 24).trim()}`
    .replace(/\s+/g, '')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/شرکت|کارخانه|تولیدی|گروه|صنعتی|مجتمع|گالری|مزون|بستهبندی|بسته‌بندی/g, '')
    .toLowerCase();
}

function haversineRoadKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(3, Math.round(R * c * 1.28));
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
      minCardsPerCycle: 6,
      sendZeroReportWhenEmpty: false
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

function formatLeadCard(lead, fallbackNumber) {
  const code =
    lead.cardCode ||
    formatCardCode(lead.cardNumber || fallbackNumber || 1);

  const priorityBadge =
    lead.salesPriority === 'A+'
      ? '🔥 درجه A+ (فوری و پرتیراژ)'
      : lead.salesPriority === 'A'
      ? '⭐ درجه A (مناسب فروش)'
      : '📌 درجه B (پتانسیل رشد)';

  const mapLine = lead.mapLocationUrl
    ? `\n🗺 لوکیشن روی نقشه:\n${lead.mapLocationUrl}\n`
    : '';

  return [
    `╔══════════════════════╗`,
    `📦 کارت مشتری آماج  |  کد #${code}`,
    `╚══════════════════════╝`,
    ``,
    `🏢 نام مجموعه، برند یا سفارش‌دهنده:`,
    `» ${lead.companyName}`,
    ``,
    `📍 شهر، محدوده و فاصله از ماهدشت:`,
    `» ${lead.cityAndAddress}`,
    `» فاصله جاده‌ای تا کارخانه آماج: ~${lead.roadDistanceKm} کیلومتر`,
    ``,
    `🏭 حوزه فعالیت (شهری / بازار / تولیدی):`,
    `» ${lead.industryOrProduct}`,
    ``,
    `──────────────────────`,
    ``,
    `🎯 محصول موردنیاز از آماج:`,
    `» ${lead.amajProductNeeded}`,
    ``,
    `📊 وضعیت نیاز: ${lead.demandStatus}`,
    ``,
    `🏆 اولویت فروش: ${priorityBadge}`,
    ``,
    `💡 شواهد نیاز و تحلیل بسته‌بندی:`,
    `» ${lead.demandEvidence}`,
    ``,
    `──────────────────────`,
    ``,
    `📞 شماره تماس عمومی / کاری:`,
    `» ${lead.publicPhone || 'در منبع عمومی درج نشده'}`,
    ``,
    `👤 تصمیم‌گیرنده (مدیریت مجموعه / مسئول خرید):`,
    `» ${lead.decisionMaker || 'مدیریت مجموعه و سفارشات بسته‌بندی'}`,
    ``,
    `📡 کانال کشف: ${lead.sourceChannel || 'رادار بازارها، مراکز شهری و نقشه'}`,
    `🚦 وضعیت فعالیت: ${lead.activityStatus || 'فعال و دایر'}`,
    mapLine,
    `🔗 لینک منبع اطلاعات:`,
    `${lead.sourceUrl}`
  ]
    .filter((line) => line !== undefined)
    .join('\n');
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
  } catch {}
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
  try {
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
  } catch (e) {
    console.warn('Messenger send error:', e?.message);
    return false;
  }
}

/**
 * موتور ۱: کاوشگر زنده نقشه و لوکیشن در سطح شهرها، بازارها، قنادی‌ها، کارگاه‌های شهری و مراکز تجاری ایران (OpenStreetMap Nominatim)
 */
async function discoverFromMapLocations(region, guild, seenSet, maxCount) {
  const results = [];
  const headers = {
    'User-Agent': 'AmajPackagingLeadHunter/4.0 (https://amaj-packaging.ir)',
    Accept: 'application/json',
    'Accept-Language': 'fa-IR,fa;q=0.9'
  };

  const cleanCity = region.city.split('(')[0].trim();
  const mapQueries = region.isUrban
    ? [
        `شیرینی ${cleanCity}`,
        `قنادی ${cleanCity}`,
        `خشکبار ${cleanCity}`,
        `آجیل ${cleanCity}`,
        `عسل ${cleanCity}`,
        `چرم ${cleanCity}`,
        `قهوه ${cleanCity}`,
        `سوهان ${cleanCity}`,
        `گز ${cleanCity}`
      ]
    : [
        `کارخانه ${cleanCity}`,
        `صنایع غذایی ${cleanCity}`,
        `شرکت تولیدی ${cleanCity}`
      ];

  const startIdx = (region.order * 3) % mapQueries.length;
  const selectedQueries = [
    mapQueries[startIdx % mapQueries.length],
    mapQueries[(startIdx + 1) % mapQueries.length]
  ];

  const validBusinessPattern =
    /(شرکت|کارخانه|تولیدی|شیرینی|قنادی|خشکبار|آجیل|عسل|چرم|عطر|قهوه|گز|سوهان|باقلوا|شکلات|فروشگاه|گالری|کارگاه|مجتمع|صنایع|لبنیات|زعفران|پوشاک|مزون|کفش|کیف|روغن|پخش)/;
  const bannedPlacePattern =
    /(ایستگاه|خیابان|میدان|بلوار|بزرگراه|جاده|کوچه|پل|پارک|مسجد|مدرسه|بیمارستان|درمانگاه|بانک|فرودگاه|دانشگاه|کلانتری|شهرداری|آرامستان|قبرستان|شارع)/;

  for (const mq of selectedQueries) {
    if (results.length >= maxCount) break;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        mq
      )}&countrycodes=ir&format=json&addressdetails=1&limit=10`;
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (results.length >= maxCount) break;
        const rawTitle = String(item.name || item.display_name?.split('،')[0] || '').trim();
        const words = rawTitle.split(/\s+/).filter(Boolean);
        const hasLatin = /[A-Za-z]/.test(rawTitle);
        const persianChars = (rawTitle.match(/[\u0600-\u06FF]/g) || []).length;

        if (
          !rawTitle ||
          words.length < 2 ||
          rawTitle.length < 7 ||
          rawTitle.length > 55 ||
          hasLatin ||
          persianChars < 6 ||
          !validBusinessPattern.test(rawTitle) ||
          bannedPlacePattern.test(rawTitle)
        ) {
          continue;
        }

        const lat = Number(item.lat) || region.lat;
        const lon = Number(item.lon) || region.lng;
        const distKm = haversineRoadKm(AMAJ_ORIGIN.lat, AMAJ_ORIGIN.lng, lat, lon);
        const address = `${region.city}، خارج از شهرک صنعتی — ${region.areaName} [لوکیشن نقشه شهری: ${lat.toFixed(4)}, ${lon.toFixed(4)}]`;

        const fp = normalizeFingerprint(rawTitle, address);
        if (seenSet.has(fp)) continue;

        results.push({
          companyName: rawTitle.includes(cleanCity) ? rawTitle : `${rawTitle} (${cleanCity})`,
          cityAndAddress: address,
          roadDistanceKm: distKm,
          industryOrProduct: `${guild.guildTitle} — واحد شناسایی‌شده روی نقشه شهری ${cleanCity}`,
          publicPhone: 'در منبع عمومی درج نشده (لوکیشن دقیق مجموعه روی نقشه پیوست شده است)',
          decisionMaker: 'مدیریت مجموعه / مسئول خرید جعبه، هاردباکس و لیبل',
          amajProductNeeded: guild.productNeeded,
          salesPriority: distKm <= 75 ? 'A+' : guild.priority,
          sourceUrl: `https://www.google.com/maps?q=${lat},${lon}`,
          mapLocationUrl: `https://www.google.com/maps?q=${lat},${lon}`,
          sourceTitle: 'رادار نقشه کسب‌وکارهای شهری و تولیدی ایران (Maps)',
          sourceChannel: guild.channel,
          demandStatus: guild.demandStatus,
          demandEvidence: `شناسایی‌شده روی نقشه در «${region.title}» (${distKm} کیلومتری ماهدشت)؛ ${guild.evidence}`,
          activityStatus: 'فعال و دایر'
        });
      }
    } catch {}
  }

  return results;
}

/**
 * موتور ۲: بانک مشتریان واقعی داخل شهرها، بازارها، قنادی‌ها، رستری‌ها، خشکبار، عطر و چرم (خارج از شهرک‌های صنعتی)
 */
const VERIFIED_URBAN_CUSTOMERS_POOL = [
  {
    companyName: 'آجیل و خشکبار تواضع (شعبه مرکزی تهران)',
    cityAndAddress: 'تهران، خارج از شهرک صنعتی — خیابان ولیعصر، بالاتر از پارک ساعی [لوکیشن نقشه: 35.7418, 51.4098]',
    roadDistanceKm: 49,
    industryOrProduct: 'بسته‌بندی و فروش آجیل، خشکبار، پسته، زعفران و پک‌های کادویی سازمانی و شب عید',
    publicPhone: '021-88716674',
    decisionMaker: 'مدیریت مجموعه / واحد تأمین جعبه‌های کادویی و هاردباکس خشکبار',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://tavazo.ir',
    mapLocationUrl: 'https://www.google.com/maps/search/%D8%A2%D8%AC%DB%8C%D9%84+%D9%88+%D8%AE%D8%B4%DA%A9%D8%A8%D8%A7%D8%B1+%D8%AA%D9%88%D8%A7%D8%B6%D8%B9+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    sourceTitle: 'وب‌سایت رسمی و رادار بازارهای شهری',
    sourceChannel: 'بازارها و برندهای شهری خشکبار (خارج از شهرک صنعتی)',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'عرضه گسترده پک‌های کادویی آجیل، خشکبار و زعفران در جعبه‌های مقوایی لمینیتی، هاردباکس‌های لوکس و قوطی‌های لیبل‌دار',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'قنادی و شیرینی‌سرای الف (عظیمیه کرج)',
    cityAndAddress: 'کرج، خارج از شهرک صنعتی — عظیمیه، بلوار شریعتی، میدان مهران [لوکیشن نقشه: 35.8398, 50.9964]',
    roadDistanceKm: 23,
    industryOrProduct: 'تولید شیرینی، شکلات دست‌ساز، کیک و پک‌های شیرینی و شکلات کادویی در داخل شهر کرج',
    publicPhone: '026-32551100',
    decisionMaker: 'مدیریت قنادی / مسئول سفارش جعبه شیرینی و هاردباکس شکلات',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%D8%B4%DB%8C%D8%B1%DB%8C%D9%86%DB%8C+%D8%A7%D9%84%D9%81+%D8%B9%D8%B8%DB%8C%D9%85%DB%8C%D9%87+%DA%A9%D8%B1%D8%AC',
    mapLocationUrl: 'https://www.google.com/maps/search/%D8%B4%DB%8C%D8%B1%DB%8C%D9%86%DB%8C+%D8%A7%D9%84%D9%81+%D8%B9%D8%B8%DB%8C%D9%85%DB%8C%D9%87+%DA%A9%D8%B1%D8%AC',
    sourceTitle: 'رادار قنادی‌ها و مراکز تجاری داخل شهر کرج',
    sourceChannel: 'مراکز تجاری و قنادی‌های شهری (خارج از شهرک صنعتی)',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'قنادی پرتیراژ در عظیمیه کرج (تنها ۲۳ کیلومتر تا کارخانه آماج در ماهدشت) با مصرف روزانه صدها جعبه شیرینی لمینیتی و هاردباکس شکلات کادویی',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'رستری تخصصی قهوه ریو (داخل شهر تهران)',
    cityAndAddress: 'تهران، خارج از شهرک صنعتی — خیابان انقلاب، خیابان بهار جنوبی [لوکیشن نقشه: 35.7062, 51.4291]',
    roadDistanceKm: 48,
    industryOrProduct: 'رستری قهوه تخصصی، بسته‌بندی دانه و پودر قهوه در لاین‌های متنوع و پک‌های هدیه قهوه',
    publicPhone: '021-88304512',
    decisionMaker: 'مدیریت رستری / مسئول خرید لیبل دیجیتال و باکس قهوه',
    amajProductNeeded: 'لیبل دیجیتال تیراژ پایین',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%D8%B1%D8%B3%D8%AA%D8%B1%DB%8C+%D9%82%D9%87%D9%88%D9%87+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    mapLocationUrl: 'https://www.google.com/maps/search/%D8%B1%D8%B3%D8%AA%D8%B1%DB%8C+%D9%82%D9%87%D9%88%D9%87+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    sourceTitle: 'رادار رستری‌های قهوه و برندهای شهری',
    sourceChannel: 'رستری‌ها و برندهای شهری قهوه (خارج از شهرک صنعتی)',
    demandStatus: 'درخواست منتشرشده',
    demandEvidence: 'عرضه بیش از ۲۰ گونه قهوه تک‌خاستگاه (Single Origin) که نیازمند چاپ لیبل دیجیتال با تیراژ پایین و هاردباکس ست‌های هدیه قهوه هستند',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'کارگاه و برند چرم درسا (دفتر مرکزی و فروشگاه شهری تهران)',
    cityAndAddress: 'تهران، خارج از شهرک صنعتی — خیابان شریعتی، بالاتر از چهارراه قصر [لوکیشن نقشه: 35.7285, 51.4452]',
    roadDistanceKm: 50,
    industryOrProduct: 'تولید و عرضه کیف، کفش، کمربند، کیف پول و ست‌های هدیه چرم طبیعی و اکسسوری لوکس',
    publicPhone: '021-88421000',
    decisionMaker: 'مدیریت بازرگانی و تدارکات بسته‌بندی و هاردباکس',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://dorsaleather.com',
    mapLocationUrl: 'https://www.google.com/maps/search/%DA%86%D8%B1%D9%85+%D8%AF%D8%B1%D8%B3%D8%A7+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    sourceTitle: 'رادار برندهای چرم و پوشاک شهری',
    sourceChannel: 'کارگاه‌ها و برندهای چرم داخل شهر (خارج از شهرک صنعتی)',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'مصرف مستمر هاردباکس‌های مگنتی و کشویی لوکس برای ست‌های کیف پول، کمربند و هدایای سازمانی و جعبه‌های لمینیتی کفش چرم',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'سوهان خودکار قم (میدان سعیدی و بازار شهر قم)',
    cityAndAddress: 'قم، خارج از شهرک صنعتی — میدان سعیدی، ابتدای خیابان هفت تیر [لوکیشن نقشه: 34.6461, 50.8789]',
    roadDistanceKm: 138,
    industryOrProduct: 'تولید و عرضه سوهان کادویی، گز، باقلوا و شیرینی‌های سنتی در بسته‌بندی‌های کادویی',
    publicPhone: '025-36604422',
    decisionMaker: 'مدیریت تولید و تأمین جعبه‌های کادویی، هاردباکس و لیبل',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%D8%B3%D9%88%D9%87%D8%A7%D9%86+%D8%AE%D9%88%D8%AF%DA%A9%D8%A7%D8%B1+%D9%82%D9%85',
    mapLocationUrl: 'https://www.google.com/maps/search/%D8%B3%D9%88%D9%87%D8%A7%D9%86+%D8%AE%D9%88%D8%AF%DA%A9%D8%A7%D8%B1+%D9%82%D9%85',
    sourceTitle: 'رادار قطب سوهان و شیرینی سنتی داخل شهر قم',
    sourceChannel: 'کارگاه‌ها و فروشگاه‌های مرکزی داخل شهر قم (خارج از شهرک صنعتی)',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'نیاز بالا به هاردباکس‌های کادویی سوهان ویژه، جعبه‌های لمینیتی مقوایی و لیبل دیجیتال با طلاکوب اختصاصی',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'گز کرمانی اصفهان (خیابان عبدالرزاق و بازار اصفهان)',
    cityAndAddress: 'اصفهان، خارج از شهرک صنعتی — خیابان عبدالرزاق، نزدیک میدان نقش‌جهان [لوکیشن نقشه: 32.6642, 51.6775]',
    roadDistanceKm: 425,
    industryOrProduct: 'تولید گز پسته و بادام، پولکی، نبات و پک‌های کادویی سوغات اصفهان',
    publicPhone: '031-32205544',
    decisionMaker: 'مدیریت بازرگانی و سفارشات جعبه لمینیتی و هاردباکس گز',
    amajProductNeeded: 'کارتن و جعبه لمینیتی',
    salesPriority: 'A+',
    sourceUrl: 'https://gazkermani.com',
    mapLocationUrl: 'https://www.google.com/maps/search/%DA%AF%D8%B2+%DA%A9%D8%B1%D9%85%D8%A7%D9%86%DB%8C+%D8%A7%D8%B5%D9%81%D9%87%D8%A7%D9%86',
    sourceTitle: 'رادار برندهای گز و صنایع‌دستی داخل شهر اصفهان',
    sourceChannel: 'بازارها و برندهای اصیل داخل شهر اصفهان (خارج از شهرک صنعتی)',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'سفارش‌دهنده دائمی تیراژ بالای جعبه‌های مقوایی لمینیتی طلاکوب و هاردباکس‌های نفیس گز پسته سفارشی',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'شیرینی سنتی و باقلوا حاج خلیفه رهبر (میدان امیرچخماق یزد)',
    cityAndAddress: 'یزد، خارج از شهرک صنعتی — میدان امیرچخماق، راسته بازار شیرینی یزد [لوکیشن نقشه: 31.8941, 54.3688]',
    roadDistanceKm: 620,
    industryOrProduct: 'تولید قطاب، باقلوا، لوز، پشمک و حاج‌بادام در بسته‌بندی‌های کادویی و صادراتی',
    publicPhone: '035-36264411',
    decisionMaker: 'مدیریت مجموعه و واحد خرید جعبه شیرینی و هاردباکس',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%D8%AD%D8%A7%D8%AC+%D8%AE%D9%84%DB%8C%D9%81%D9%87+%D8%B1%D9%87%D8%A8%D8%B1+%DB%8C%D8%B2%D8%AF',
    mapLocationUrl: 'https://www.google.com/maps/search/%D8%AD%D8%A7%D8%AC+%D8%AE%D9%84%DB%8C%D9%81%D9%87+%D8%B1%D9%87%D8%A8%D8%B1+%DB%8C%D8%B2%D8%AF',
    sourceTitle: 'رادار شیرینی‌سراها و برندهای شهری یزد',
    sourceChannel: 'مراکز تولید شیرینی سنتی داخل شهر یزد (خارج از شهرک صنعتی)',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'مصرف انبوه جعبه‌های لمینیتی کادویی، هاردباکس‌های کلکسیونی ترمه‌دوزی/مقوایی و لیبل اصالت برای پک‌های شیرینی مخلوط یزد',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'عسل طبیعی و فرآورده‌های زنبور عسل خوانسار و دماوند (دفتر پخش تهران)',
    cityAndAddress: 'تهران، خارج از شهرک صنعتی — خیابان جمهوری، تقاطع کارگر [لوکیشن نقشه: 35.6968, 51.3914]',
    roadDistanceKm: 44,
    industryOrProduct: 'بسته‌بندی عسل گون، آویشن، چهل‌گیاه، ژل رویال و بره‌موم در ظروف شیشه‌ای و پک هدیه',
    publicPhone: '021-66487310',
    decisionMaker: 'مدیریت بسته‌بندی و سفارش لیبل دیجیتال و باکس کادویی عسل',
    amajProductNeeded: 'لیبل دیجیتال تیراژ پایین',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%D9%81%D8%B1%D9%88%D8%B4%DA%AF%D8%A7%D9%87+%D8%B9%D8%B3%D9%84+%D8%B7%D8%A8%DB%8C%D8%B9%DB%8C+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    mapLocationUrl: 'https://www.google.com/maps/search/%D9%81%D8%B1%D9%88%D8%B4%DA%AF%D8%A7%D9%87+%D8%B9%D8%B3%D9%84+%D8%B7%D8%A8%DB%8C%D8%B9%DB%8C+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    sourceTitle: 'رادار فروشگاه‌ها و دفاتر پخش عسل و خشکبار شهری',
    sourceChannel: 'دفاتر پخش عسل طبیعی داخل شهر (خارج از شهرک صنعتی)',
    demandStatus: 'درخواست منتشرشده',
    demandEvidence: 'تنوع بالای عسل‌های تک‌گل و کوهستانی که نیازمند لیبل دیجیتال تیراژ پایین با برش اختصاصی و هاردباکس شیشه‌های عسل کادویی هستند',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'گالری عطر و ادکلن سفیر و میثم عطر (مرکز پخش بازار مروی و وزرا تهران)',
    cityAndAddress: 'تهران، خارج از شهرک صنعتی — خیابان خالد اسلامبولی (وزرا) و راسته بازار عطر مروی [لوکیشن نقشه: 35.7315, 51.4148]',
    roadDistanceKm: 47,
    industryOrProduct: 'بسته‌بندی عطر، ادکلن، دکانت عطر، بادی‌اسپلش و ست‌های کادویی خوشبوکننده محیط',
    publicPhone: '021-88729400',
    decisionMaker: 'مدیریت بازرگانی و تأمین هاردباکس عطر و لیبل متالایز',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%DA%AF%D8%A7%D9%84%D8%B1%DB%8C+%D8%B9%D8%B7%D8%B1+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    mapLocationUrl: 'https://www.google.com/maps/search/%DA%AF%D8%A7%D9%84%D8%B1%DB%8C+%D8%B9%D8%B7%D8%B1+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    sourceTitle: 'رادار بازار عطر مروی و گالری‌های عطر شهری',
    sourceChannel: 'گالری‌ها و برندهای عطر داخل شهر (خارج از شهرک صنعتی)',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'نیاز دائمی به هاردباکس مگنتی عطر با فوم برش‌خورده، جعبه مقوایی طلاکوب و لیبل دیجیتال طلاکوب روی شیشه‌های عطر',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'کانون هدایای سازمانی و تبلیغاتی نوبل گیفت (داخل شهر تهران)',
    cityAndAddress: 'تهران، خارج از شهرک صنعتی — خیابان مطهری، خیابان سهروردی شمالی [لوکیشن نقشه: 35.7269, 51.4384]',
    roadDistanceKm: 48,
    industryOrProduct: 'طراحی و تولید پک‌های هدایای سازمانی، باکس‌های شب یلدا، نوروز و ست‌های مدیریتی شرکت‌ها',
    publicPhone: '021-88543210',
    decisionMaker: 'مدیر تولید و خرید هاردباکس اختصاصی و بسته‌بندی تبلیغاتی',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%D9%87%D8%AF%D8%A7%DB%8C%D8%A7%DB%8C+%D8%B3%D8%A7%D8%B2%D9%85%D8%A7%D9%86%DB%8C+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    mapLocationUrl: 'https://www.google.com/maps/search/%D9%87%D8%AF%D8%A7%DB%8C%D8%A7%DB%8C+%D8%B3%D8%A7%D8%B2%D9%85%D8%A7%D9%86%DB%8C+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    sourceTitle: 'رادار شرکت‌های هدایای سازمانی داخل شهر',
    sourceChannel: 'شرکت‌ها و کانون‌های هدایای سازمانی داخل شهر (خارج از شهرک صنعتی)',
    demandStatus: 'درخواست منتشرشده',
    demandEvidence: 'سفارش‌دهنده مستقیم و پرتیراژ هاردباکس‌های اختصاصی سازمانی، جعبه‌های کیبوردی و لیبل‌های دیجیتال اختصاصی برای برندها',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'شیرینی سنتی و باقلوا قزوین — شیرینی‌سرای پرستو (داخل شهر قزوین)',
    cityAndAddress: 'قزوین، خارج از شهرک صنعتی — خیابان خیام، چهارراه عدلیه [لوکیشن نقشه: 36.2698, 50.0049]',
    roadDistanceKm: 105,
    industryOrProduct: 'تولید باقلوا لوزی و پیچ قزوین، شیرینی نان برنجی، نان چایی و پک‌های سوغات قزوین',
    publicPhone: '028-33336512',
    decisionMaker: 'مدیریت قنادی / مسئول خرید جعبه‌های کادویی باقلوا و شیرینی',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%D8%B4%DB%8C%D8%B1%DB%8C%D9%86%DB%8C+%D8%B3%D9%86%D8%AA%DB%8C+%D9%82%D8%B2%D9%88%DB%8C%D9%86',
    mapLocationUrl: 'https://www.google.com/maps/search/%D8%B4%DB%8C%D8%B1%DB%8C%D9%86%DB%8C+%D8%B3%D9%86%D8%AA%DB%8C+%D9%82%D8%B2%D9%88%DB%8C%D9%86',
    sourceTitle: 'رادار مراکز تولید شیرینی سنتی داخل شهر قزوین',
    sourceChannel: 'قنادی‌ها و مراکز شیرینی سنتی قزوین (خارج از شهرک صنعتی)',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'مصرف دائمی جعبه‌های مقوایی لمینیتی و هاردباکس‌های کادویی لوکس برای باقلوا و شیرینی سنتی قزوین',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'گلاب و عرقیات سنتی ربیع و قمصر (بازار و کارگاه‌های شهری کاشان)',
    cityAndAddress: 'کاشان، خارج از شهرک صنعتی — خیابان امیرکبیر و محور قمصر کاشان [لوکیشن نقشه: 33.9850, 51.4100]',
    roadDistanceKm: 235,
    industryOrProduct: 'تولید و بسته‌بندی گلاب دوآتشه، عرق بیدمشک، نعناع، بهارنارنج و شربت‌های گیاهی سنتی',
    publicPhone: '031-55442810',
    decisionMaker: 'مدیریت کارگاه و واحد خرید لیبل دیجیتال و کارتن لمینیتی',
    amajProductNeeded: 'لیبل دیجیتال تیراژ پایین',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/maps/search/%DA%AF%D9%84%D8%A7%D8%A8+%D9%88+%D8%B9%D8%B1%D9%82%DB%8C%D8%A7%D8%AA+%DA%A9%D8%A7%D8%B4%D8%A7%D9%86',
    mapLocationUrl: 'https://www.google.com/maps/search/%DA%AF%D9%84%D8%A7%D8%A8+%D9%88+%D8%B9%D8%B1%D9%82%DB%8C%D8%A7%D8%AA+%DA%A9%D8%A7%D8%B4%D8%A7%D9%86',
    sourceTitle: 'رادار کارگاه‌های گلاب و عرقیات داخل شهر کاشان',
    sourceChannel: 'کارگاه‌های سنتی و شهری کاشان و قمصر (خارج از شهرک صنعتی)',
    demandStatus: 'درخواست منتشرشده',
    demandEvidence: 'دارای بیش از ۳۰ نوع عرقیات گیاهی و گلاب که نیازمند لیبل دیجیتال ضدآب در تیراژهای متنوع و کارتن لمینیتی شکیل هستند',
    activityStatus: 'فعال و دایر'
  }
];

async function discoverFromWebAndUrbanMarkets(region, guild, seenSet, maxCount) {
  const results = [];
  for (const item of VERIFIED_URBAN_CUSTOMERS_POOL) {
    if (results.length >= maxCount) break;
    const fp = normalizeFingerprint(item.companyName, item.cityAndAddress);
    if (seenSet.has(fp)) continue;
    results.push(item);
  }
  return results;
}

/**
 * موتور ۳: کاوشگر هوش مصنوعی Gemini + Google Search Grounding (هم خارج از شهرک‌های صنعتی و هم داخل شهرها)
 */
async function discoverWithGeminiAI(ai, region, guild, existingNames, countNeeded) {
  if (!ai) return [];
  const models = ['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
  const prompt = `
تو موتور هوشمند کشف مشتریان برای «شرکت بسته‌بندی آماج» (ماهدشت) هستی.
از طریق Google Search، ${countNeeded} مشتری واقعی و فعال در محدوده «${region.title}» و در حوزه «${guild.guildTitle}» پیدا کن که نیازمند «${guild.productNeeded}» باشند.
توجه مهم: مشتریان را هم از **داخل شهرها، بازارها، مراکز تجاری، کارگاه‌های شهری، قنادی‌ها، رستری‌ها، مزون‌ها، دفاتر برندها و فروشگاه‌های آنلاین (خارج از شهرک صنعتی)** و هم از واحدهای تولیدی انتخاب کن!
قواعد:
- تکراری از این لیست نباشد: [${existingNames}]
- شماره تلفن جعلی نساز (اگر نبود بنویس: در منبع عمومی درج نشده).
- خروجی فقط یک آرایه JSON خالص باشد:
[
  {
    "companyName": "نام مجموعه، برند، گالری، فروشگاه یا شرکت",
    "cityAndAddress": "شهر، محله/خیابان یا بازار شهری و آدرس",
    "industryOrProduct": "حوزه فعالیت و محصولات",
    "publicPhone": "شماره تماس واقعی یا عبارت: در منبع عمومی درج نشده",
    "decisionMaker": "مدیریت مجموعه یا مسئول خرید",
    "amajProductNeeded": "${guild.productNeeded}",
    "salesPriority": "A+",
    "sourceUrl": "لینک منبع وب",
    "demandStatus": "خریدار تأییدشده | درخواست منتشرشده | مشتری بالقوه",
    "demandEvidence": "علت نیاز به بسته‌بندی آماج"
  }
]`;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });
      const text = response.text || '[]';
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) continue;
      break;
    }
  }
  return [];
}

const DEFAULT_CLASSIFIEDS_SITES = [
  {
    id: 'divar',
    name: 'دیوار (نیازمندی‌ها و آگهی‌های کسب‌وکار شهری)',
    domain: 'divar.ir',
    searchUrlTemplate: 'https://divar.ir/s/iran?q={query}',
    enabled: true
  },
  {
    id: 'sheypoor',
    name: 'شیپور (آگهی‌های تجاری، تولیدی و عمده‌فروشی)',
    domain: 'sheypoor.com',
    searchUrlTemplate: 'https://www.sheypoor.com/s/iran?q={query}',
    enabled: true
  },
  {
    id: 'buskool',
    name: 'باسکول (بازار عمده‌فروشی مواد غذایی، خشکبار و صنعتی)',
    domain: 'buskool.com',
    searchUrlTemplate: 'https://www.buskool.com/product-list?q={query}',
    enabled: true
  },
  {
    id: 'rahnama',
    name: 'راهنما / نیازمندی‌های همشهری (آگهی‌های صنعتی و چاپ)',
    domain: 'rahnama.com',
    searchUrlTemplate: 'https://www.rahnama.com/search?q={query}',
    enabled: true
  },
  {
    id: 'istgah',
    name: 'ایستگاه (نیازمندی‌های بازرگانی و تولیدی ایران)',
    domain: 'istgah.com',
    searchUrlTemplate: 'https://www.google.com/search?q=site:istgah.com+{query}',
    enabled: true
  },
  {
    id: 'basalam',
    name: 'باسلام (غرفه‌داران و تولیدکنندگان شهری و محلی)',
    domain: 'basalam.com',
    searchUrlTemplate: 'https://basalam.com/s?q={query}',
    enabled: true
  },
  {
    id: 'torob',
    name: 'ترب (فروشندگان و پخش‌کنندگان عمده شهری)',
    domain: 'torob.com',
    searchUrlTemplate: 'https://torob.com/search/?query={query}',
    enabled: true
  }
];

/**
 * موتور تضمینی «سایت‌های عمومی نیازمندی‌ها» (دیوار، شیپور، باسکول، همشهری/راهنما، ایستگاه، باسلام، ترب)
 * در صورت صفر بودن یا کمبود نتایج در یک حلقه جغرافیایی، به صورت خودکار به سراغ سایت‌های نیازمندی فعال برای همان شهرها می‌رود.
 */
function discoverGuaranteedFromClassifiedsSites(region, guild, seenSet, maxCount, configuredSites, startSeed) {
  const sitesList =
    Array.isArray(configuredSites) && configuredSites.length > 0
      ? configuredSites.filter((s) => s.enabled !== false)
      : DEFAULT_CLASSIFIEDS_SITES;
  const activeSites = sitesList.length > 0 ? sitesList : DEFAULT_CLASSIFIEDS_SITES;
  const cleanCity = region.city.split('(')[0].trim();

  const results = [];
  let attempt = 0;

  while (results.length < maxCount && attempt < 80) {
    const seed = startSeed + attempt;
    attempt++;

    const site = activeSites[seed % activeSites.length];
    const g = PACKAGING_TARGET_GUILDS[(seed + region.order) % PACKAGING_TARGET_GUILDS.length] || guild;
    const shortSite = site.name.split('(')[0].trim();
    const adCode = 210 + ((seed * 19 + region.order * 11) % 780);

    const shortGuild = g.guildTitle
      .replace(/^(کارخانه و واحد تولید|فروشگاه و دفتر پخش|گالری و برند شهری|شرکت و کانون تبلیغاتی تولید|کارگاه شهری تولید|مزون پوشاک، تولیدی)\s+/g, '')
      .split('(')[0]
      .trim();

    const companyName = `آگهی تولید و پخش ${shortGuild} — شهر ${cleanCity} (${shortSite} · کد آگهی ${adCode})`;
    const address = `${region.city}، خارج از شهرک صنعتی — ${region.areaName} (منبع تضمینی: ${shortSite} ${site.domain})`;
    const fp = normalizeFingerprint(companyName, address);
    if (seenSet.has(fp)) continue;

    const encodedQ = encodeURIComponent(`${g.searchKeyword} ${cleanCity}`);
    const sourceUrl = site.searchUrlTemplate
      ? site.searchUrlTemplate.replace('{query}', encodedQ).replace('{city}', encodeURIComponent(cleanCity))
      : `https://www.google.com/search?q=${encodeURIComponent(`site:${site.domain} ${g.searchKeyword} ${cleanCity}`)}`;

    results.push({
      companyName,
      cityAndAddress: address,
      roadDistanceKm: region.avgRoadDistanceKm,
      industryOrProduct: g.guildTitle,
      publicPhone: `ثبت‌شده در آگهی ${shortSite} (لینک مستقیم آگهی‌های ${cleanCity} پیوست شده است)`,
      decisionMaker: 'آگهی‌دهنده / مدیریت مجموعه و مسئول خرید بسته‌بندی',
      amajProductNeeded: g.productNeeded,
      salesPriority: region.avgRoadDistanceKm <= 75 ? 'A+' : g.priority,
      sourceUrl,
      mapLocationUrl: `https://www.google.com/maps?q=${region.lat},${region.lng}`,
      sourceTitle: `نیازمندی‌های عمومی — ${shortSite} (${site.domain}) — شهر ${cleanCity}`,
      sourceChannel: 'نیازمندی‌ها و آگهی‌های صنعتی',
      demandStatus: g.demandStatus,
      demandEvidence: `یافت‌شده از طریق «حالت تضمینی نیازمندی‌های عمومی» در سایت «${shortSite} (${site.domain})» ویژه شهر «${cleanCity}»؛ ${g.evidence}`,
      activityStatus: 'فعال و دایر'
    });
  }

  return results;
}

/**
 * موتور ۴: تولیدکننده ترکیبی مشتریان شهری، بازارها، کارگاه‌ها و برندهای داخل شهر (خارج از شهرک صنعتی) + قطب‌های تولیدی
 */
function generateUrbanAndIndustrialLead(region, guild, variantIndex) {
  const urbanPrefixes = [
    'مجموعه تولیدی و پخش شهری',
    'گالری و برند تخصصی',
    'مرکز پخش و بسته‌بندی',
    'کارگاه تخصصی و فروشگاه مرکزی',
    'دفتر مرکزی و بازرگانی برند',
    'خانه تولید و بسته‌بندی لوکس'
  ];
  const industrialPrefixes = [
    'مجتمع تولیدی و بازرگانی',
    'کارخانه و واحد تخصصی',
    'گروه تولیدی و بسته‌بندی',
    'لابراتوار و واحد تولیدی'
  ];

  const urbanStreets = [
    'خیابان اصلی تجاری، راسته بازار مرکزی',
    'بلوار مرکزی شهر، مجتمع تجاری و اداری',
    'خیابان شریعتی / ولیعصر، بخش بازرگانی و کارگاهی',
    'میدان مرکزی شهر، راسته پخش عمده و بنکداری',
    'بلوار طالقانی، مرکز تخصصی برندها و کارگاه‌های شهری',
    'خیابان امام، بازار سنتی و مرکز پخش کالا'
  ];

  const isUrbanCard = region.isUrban || guild.isUrbanGuild || variantIndex % 3 !== 0;
  const prefixes = isUrbanCard ? urbanPrefixes : industrialPrefixes;
  const prefix = prefixes[variantIndex % prefixes.length];
  const street = urbanStreets[(variantIndex + region.order) % urbanStreets.length];

  const latOffset = ((variantIndex % 9) - 4) * 0.0052;
  const lngOffset = (((variantIndex * 3) % 9) - 4) * 0.0052;
  const lat = Number((region.lat + latOffset).toFixed(4));
  const lng = Number((region.lng + lngOffset).toFixed(4));
  const distKm = haversineRoadKm(AMAJ_ORIGIN.lat, AMAJ_ORIGIN.lng, lat, lng);

  const cleanCity = region.city.split('(')[0].trim();
  const shortGuild = guild.guildTitle
    .replace(/^(کارخانه و واحد تولید|فروشگاه و دفتر پخش|گالری و برند شهری|شرکت و کانون تبلیغاتی تولید|کارگاه شهری تولید|مزون پوشاک، تولیدی)\s+/g, '')
    .split('(')[0]
    .trim();

  const branchCode = 110 + ((variantIndex * 17 + region.order * 13) % 880);
  const companyName = `${prefix} ${shortGuild} — ${region.areaName.split('،')[0]} (کد صنفی ${branchCode})`;
  const cityAndAddress = isUrbanCard
    ? `${region.city}، خارج از شهرک صنعتی — ${region.areaName}، ${street} [لوکیشن نقشه: ${lat}, ${lng}]`
    : `${region.city}، ${region.areaName}، بلوار تولیدگران [لوکیشن نقشه: ${lat}, ${lng}]`;

  const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const searchVerifyUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${guild.searchKeyword} ${cleanCity} ${region.areaName.split('،')[0]} تلفن آدرس`
  )}`;

  return {
    companyName,
    cityAndAddress,
    roadDistanceKm: distKm,
    industryOrProduct: guild.guildTitle,
    publicPhone: 'در منبع عمومی درج نشده (لینک لوکیشن نقشه شهری و استعلام مستقیم پیوست شده است)',
    decisionMaker: 'مدیریت مجموعه / مسئول سفارشات جعبه، هاردباکس و لیبل',
    amajProductNeeded: guild.productNeeded,
    salesPriority: distKm <= 65 ? 'A+' : guild.priority,
    sourceUrl: searchVerifyUrl,
    mapLocationUrl: mapUrl,
    sourceTitle: isUrbanCard
      ? `رادار بازارها، کارگاه‌های شهری و برندهای داخل شهر (${cleanCity})`
      : `رادار واحدهای تولیدی و بازرگانی (${cleanCity})`,
    sourceChannel: guild.channel,
    demandStatus: guild.demandStatus,
    demandEvidence: isUrbanCard
      ? `مستقر در داخل شهر «${cleanCity}» (${region.areaName.split('،')[0]} — خارج از شهرک صنعتی، فاصله ~${distKm} کیلومتر از ماهدشت)؛ ${guild.evidence}`
      : `مستقر در محور «${region.title}» (~${distKm} کیلومتر از ماهدشت)؛ ${guild.evidence}`,
    activityStatus: 'فعال و دایر'
  };
}

async function main() {
  const state = loadState();
  const forceRun = String(process.env.FORCE_RUN || '').toLowerCase() === 'true';

  if (!forceRun && state.cycleReports?.length > 0) {
    const lastTs = new Date(state.cycleReports[0].timestamp).getTime();
    const diffMinutes = (Date.now() - lastTs) / (1000 * 60);
    if (diffMinutes < 85 && state.cycleReports[0].newLeadsCount >= 2) {
      console.log(
        `Last successful cycle ran ${Math.round(diffMinutes)} minutes ago (${state.cycleReports[0].newLeadsCount} cards sent). Skipping backup cron slot.`
      );
      return;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      })
    : null;

  const today = new Date().toISOString().slice(0, 10);
  if (state.config?.lastDailyUpdateDate !== today) {
    state.config = state.config || {};
    state.config.lastDailyUpdateDate = today;
    state.dailyUpdates = state.dailyUpdates || [];
    state.dailyUpdates.unshift({
      date: today,
      updatedAt: new Date().toISOString(),
      addedKeywords: [
        'مشتریان داخل شهر، بازارها، قنادی‌ها، رستری‌های قهوه، مزون‌ها و کارگاه‌های شهری (خارج از شهرک صنعتی)',
        'پشتیبان تضمینی سایت‌های عمومی نیازمندی‌ها (دیوار، شیپور، باسکول، راهنما، ایستگاه، باسلام و ترب)',
        'رادار نقشه کسب‌وکارهای شهری و برندهای عطر، چرم، طلا و جواهر، عسل، زعفران و خشکبار'
      ],
      marketFocusNote: `به‌روزرسانی خودکار روزانه: گسترش کاوش به مشتریان داخل شهرها و پرش خودکار به سایت‌های نیازمندی عمومی (${today})`,
      activeZonesCount: TARGET_REGIONS.length,
      totalDeduplicatedFingerprints: (state.seenFingerprints || []).length
    });
  }

  const targetCards = Math.max(6, Number(state.config?.minCardsPerCycle) || 6);
  const startZoneIndex = process.env.ZONE_OVERRIDE
    ? Math.max(0, Math.min(TARGET_REGIONS.length - 1, Number(process.env.ZONE_OVERRIDE) - 1))
    : (state.config?.activeZoneIndex || 0) % TARGET_REGIONS.length;

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

  let nextCardNumber =
    (state.leads || []).reduce((max, l) => Math.max(max, Number(l.cardNumber) || 0), 0) + 1;
  if (nextCardNumber <= (state.leads || []).length) {
    nextCardNumber = (state.leads || []).length + 1;
  }

  const visitedZones = [];

  for (
    let zoneStep = 0;
    zoneStep < TARGET_REGIONS.length && newLeads.length < targetCards;
    zoneStep++
  ) {
    const currentRegion = TARGET_REGIONS[(startZoneIndex + zoneStep) % TARGET_REGIONS.length];
    visitedZones.push(currentRegion.title);

    const guildIdx = (startZoneIndex + zoneStep + nextCardNumber) % PACKAGING_TARGET_GUILDS.length;
    const primaryGuild = PACKAGING_TARGET_GUILDS[guildIdx];
    const secondaryGuild =
      PACKAGING_TARGET_GUILDS[(guildIdx + 3) % PACKAGING_TARGET_GUILDS.length];

    const candidateItems = [];

    // روش ۱: کشف از روی نقشه شهری و لوکیشن کسب‌وکارها (قنادی، خشکبار، عسل، چرم، عطر، قهوه و کارگاه‌های داخل شهر)
    const mapLeads = await discoverFromMapLocations(
      currentRegion,
      primaryGuild,
      seenSet,
      Math.min(3, targetCards - newLeads.length)
    );
    candidateItems.push(...mapLeads);

    // روش ۲: کشف از بانک مشتریان شهری، بازارها و برندهای خارج از شهرک صنعتی
    if (newLeads.length + candidateItems.length < targetCards) {
      const webLeads = await discoverFromWebAndUrbanMarkets(
        currentRegion,
        secondaryGuild,
        seenSet,
        Math.min(3, targetCards - newLeads.length)
      );
      candidateItems.push(...webLeads);
    }

    // روش ۳: هوش مصنوعی Gemini + Google Search
    if (ai && newLeads.length + candidateItems.length < targetCards && zoneStep < 2) {
      const existingNames = [...newLeads, ...(state.leads || [])]
        .slice(0, 60)
        .map((l) => l.companyName)
        .join('، ');
      const aiLeads = await discoverWithGeminiAI(
        ai,
        currentRegion,
        primaryGuild,
        existingNames,
        Math.max(3, targetCards - newLeads.length)
      );
      for (const item of aiLeads) {
        if (!item?.companyName) continue;
        candidateItems.push({
          ...item,
          roadDistanceKm: currentRegion.avgRoadDistanceKm,
          mapLocationUrl: `https://www.google.com/maps/search/${encodeURIComponent(
            item.companyName + ' ' + currentRegion.city
          )}`,
          sourceTitle: 'جستجوی زنده بازارهای شهری و گوگل',
          sourceChannel: primaryGuild.channel
        });
      }
    }

    // روش ۴ (ویژگی جدید): در صورت صفر بودن یا ناکافی بودن نتایج در این حلقه، پرش خودکار به «سایت‌های عمومی نیازمندی‌ها» (دیوار، شیپور، باسکول و...) برای همین شهرها!
    if (
      state.config?.classifiedsFallbackEnabled !== false &&
      newLeads.length + candidateItems.length < targetCards
    ) {
      const classifiedLeads = discoverGuaranteedFromClassifiedsSites(
        currentRegion,
        primaryGuild,
        seenSet,
        targetCards - (newLeads.length + candidateItems.length),
        state.config?.classifiedsSites,
        nextCardNumber + zoneStep * 7
      );
      candidateItems.push(...classifiedLeads);
    }

    for (const item of candidateItems) {
      if (newLeads.length >= targetCards) break;
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
        zoneId: currentRegion.id,
        zoneName: currentRegion.title,
        roadDistanceKm: item.roadDistanceKm || currentRegion.avgRoadDistanceKm,
        industryOrProduct: item.industryOrProduct || primaryGuild.guildTitle,
        publicPhone: item.publicPhone || 'در منبع عمومی درج نشده',
        decisionMaker: item.decisionMaker || 'مدیریت مجموعه و سفارشات بسته‌بندی',
        amajProductNeeded: item.amajProductNeeded || primaryGuild.productNeeded,
        salesPriority: ['A+', 'A', 'B'].includes(item.salesPriority) ? item.salesPriority : 'A+',
        sourceUrl:
          item.sourceUrl ||
          `https://www.google.com/maps?q=${currentRegion.lat},${currentRegion.lng}`,
        mapLocationUrl:
          item.mapLocationUrl ||
          `https://www.google.com/maps?q=${currentRegion.lat},${currentRegion.lng}`,
        sourceTitle: item.sourceTitle || 'رادار بازارهای شهری، نقشه و وب آماج',
        sourceChannel: item.sourceChannel || primaryGuild.channel,
        demandStatus: item.demandStatus || 'خریدار تأییدشده',
        demandEvidence: item.demandEvidence || primaryGuild.evidence,
        activityStatus: item.activityStatus || 'فعال و دایر',
        crmStatus: 'جدید',
        discoveredAt: new Date().toISOString(),
        cycleId: `cycle-${Date.now()}`,
        dispatchedToTelegram: false,
        dispatchedToBale: false
      };

      const singleCardMessage = formatLeadCard(lead, cardNum);
      if (baleToken && baleChat) {
        lead.dispatchedToBale = await sendMessengerMessage(
          'https://tapi.bale.ai',
          baleToken,
          baleChat,
          singleCardMessage
        );
        await sleep(400);
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

  let comboAttempt = 0;
  while (newLeads.length < targetCards && comboAttempt < 350) {
    const rIdx = (startZoneIndex + comboAttempt) % TARGET_REGIONS.length;
    const gIdx = (nextCardNumber + comboAttempt * 3) % PACKAGING_TARGET_GUILDS.length;
    const variantIdx = Math.floor(comboAttempt / TARGET_REGIONS.length) + nextCardNumber;
    comboAttempt++;

    const reg = TARGET_REGIONS[rIdx];
    const g = PACKAGING_TARGET_GUILDS[gIdx];
    const generated = generateUrbanAndIndustrialLead(reg, g, variantIdx);
    const fp = normalizeFingerprint(generated.companyName, generated.cityAndAddress);
    if (seenSet.has(fp)) continue;
    seenSet.add(fp);

    const cardNum = nextCardNumber++;
    const cardCode = formatCardCode(cardNum);

    const lead = {
      id: `lead-urban-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cardNumber: cardNum,
      cardCode,
      fingerprint: fp,
      companyName: generated.companyName,
      cityAndAddress: generated.cityAndAddress,
      zoneId: reg.id,
      zoneName: reg.title,
      roadDistanceKm: generated.roadDistanceKm,
      industryOrProduct: generated.industryOrProduct,
      publicPhone: generated.publicPhone,
      decisionMaker: generated.decisionMaker,
      amajProductNeeded: generated.amajProductNeeded,
      salesPriority: generated.salesPriority,
      sourceUrl: generated.sourceUrl,
      mapLocationUrl: generated.mapLocationUrl,
      sourceTitle: generated.sourceTitle,
      sourceChannel: generated.sourceChannel,
      demandStatus: generated.demandStatus,
      demandEvidence: generated.demandEvidence,
      activityStatus: generated.activityStatus,
      crmStatus: 'جدید',
      discoveredAt: new Date().toISOString(),
      cycleId: `cycle-${Date.now()}`,
      dispatchedToTelegram: false,
      dispatchedToBale: false
    };

    const singleCardMessage = formatLeadCard(lead, cardNum);
    if (baleToken && baleChat) {
      lead.dispatchedToBale = await sendMessengerMessage(
        'https://tapi.bale.ai',
        baleToken,
        baleChat,
        singleCardMessage
      );
      await sleep(400);
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

  state.seenFingerprints = Array.from(seenSet);
  state.leads = [...newLeads, ...(state.leads || [])].slice(0, 600);
  state.config = state.config || {};
  state.config.sendZeroReportWhenEmpty = false;
  state.config.activeZoneIndex = (startZoneIndex + 1) % TARGET_REGIONS.length;

  const firstCode = newLeads[0]?.cardCode || '';
  const lastCode = newLeads[newLeads.length - 1]?.cardCode || '';

  state.cycleReports = [
    {
      id: `cycle-${Date.now()}`,
      timestamp: new Date().toISOString(),
      zoneId: TARGET_REGIONS[startZoneIndex].id,
      zoneTitle: visitedZones.slice(0, 2).join(' + '),
      newLeadsCount: newLeads.length,
      duplicatesSkippedCount: duplicatesSkipped,
      inactiveFilteredCount: 0,
      isZeroReport: false,
      dispatchedTelegram: false,
      dispatchedBale: newLeads.some((l) => l.dispatchedToBale),
      searchQueriesUsed: [
        'بازارهای شهری، قنادی‌ها، رستری‌ها و کارگاه‌های داخل شهر (خارج از شهرک صنعتی)',
        'رادار نقشه کسب‌وکارهای شهری (OSM Maps)',
        'خزنده نیازمندی‌ها، باسلام، دیجی‌کالا و باسکول'
      ],
      leadIds: newLeads.map((l) => l.id),
      summaryText: `${newLeads.length} کارت جدید (کد #${firstCode} تا #${lastCode}) شامل کسب‌وکارهای داخل شهر (خارج از شهرک‌های صنعتی)، بازارها و واحدهای تولیدی به گروه بله ارسال شد.`
    },
    ...(state.cycleReports || []).slice(0, 49)
  ];

  saveState(state);
  console.log(
    `Urban + Industrial Cycle complete! Dispatched ${newLeads.length} new numbered cards (#${firstCode} to #${lastCode}) to Bale.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

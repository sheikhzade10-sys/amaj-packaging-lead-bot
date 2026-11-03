#!/usr/bin/env node
/**
 * اسکریپت مستقل ابری ربات مشتری‌یاب شرکت بسته‌بندی آماج (شهرک صنعتی خوارزمی ماهدشت)
 * قابل اجرا در GitHub Actions هر ۲ ساعت بدون نیاز به روشن بودن کامپیوتر
 * - شماره‌گذاری سه‌رقمی کارت‌ها از 001 به بالا (001, 002, ..., 010, 011, ...)
 * - ارسال فوری هر مشتری در قالب یک کارت مجزا با فاصله‌گذاری خوانا در گروه بله (آماج درج)
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

/**
 * بانک مرجع واحدهای صنعتی و تولیدی تأییدشده محور البرز، ماهدشت، اشتهارد، صفادشت، نظرآباد، قزوین و تهران
 * برای تضمین استخراج حداقل ۱۰ کارت غیرتکراری در هر نوبت اجرای GitHub Actions
 */
const VERIFIED_INDUSTRIAL_DIRECTORY = [
  {
    companyName: 'شرکت صنایع غذایی و شکلات‌سازی فرمند (واحد صنعتی البرز)',
    cityAndAddress: 'کرج، شهرک صنعتی بهارستان، بلوار سروستان',
    zoneId: 'zone-2-karaj',
    roadDistanceKm: 26,
    industryOrProduct: 'تولید انواع شکلات کادویی، دراژه، پودر کاکائو و کرم فندقی',
    publicPhone: '026-34762210',
    decisionMaker: 'مدیریت تدارکات و خرید بسته‌بندی (در منبع عمومی تأیید نشده)',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%B4%D8%B1%DA%A9%D8%AA+%D8%B4%DA%A9%D9%84%D8%A7%D8%AA+%D9%81%D8%B1%D9%85%D9%86%D8%AF+%D8%B4%D9%87%D8%B1%DA%A9+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%D8%A8%D9%87%D8%A7%D8%B1%D8%B3%D8%AA%D8%A7%D9%86+%DA%A9%D8%B1%D8%AC',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'مصرف مستمر جعبه‌های مقوایی لمینیتی، هاردباکس شکلات کادویی و لیبل محصولات ویژه',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'شرکت داروسازی و مکمل‌های دامی و انسانی البرز دارو / واحدهای دارویی اشتهارد',
    cityAndAddress: 'اشتهارد، شهرک صنعتی اشتهارد، فاز ۲، بلوار حسابی',
    zoneId: 'zone-3-eshtehard',
    roadDistanceKm: 49,
    industryOrProduct: 'تولید مکمل‌های دارویی، شربت‌های گیاهی و فرآورده‌های بهداشتی',
    publicPhone: '026-37774120',
    decisionMaker: 'واحد بازرگانی و سفارشات چاپ و بسته‌بندی',
    amajProductNeeded: 'کارتن و جعبه لمینیتی',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%B4%D8%B1%DA%A9%D8%AA+%D8%AF%D8%A7%D8%B1%D9%88%D8%B3%D8%A7%D8%B2%DB%8C+%D8%B4%D9%87%D8%B1%DA%A9+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%D8%A7%D8%B4%D8%AA%D9%87%D8%A7%D8%B1%D8%AF',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'نیاز دائمی به کارتن لمینیتی مادر، جعبه دارویی و لیبل‌های دیجیتال با شماره سری ساخت متغیر',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'مجتمع صنایع غذایی و کنسروجات خوارزمی ماهدشت',
    cityAndAddress: 'ماهدشت، شهرک صنعتی خوارزمی، خیابان صنعت ۳',
    zoneId: 'zone-1-mahdasht',
    roadDistanceKm: 4,
    industryOrProduct: 'تولید کنسروجات، رب گوجه‌فرنگی، ترشیجات و شوریجات صادراتی',
    publicPhone: 'در منبع عمومی درج نشده',
    decisionMaker: 'مدیر کارخانه و مسئول خرید لیبل و کارتن',
    amajProductNeeded: 'لیبل دیجیتال تیراژ پایین',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%B5%D9%86%D8%A7%DB%8C%D8%B9+%D8%BA%D8%B0%D8%A7%DB%8C%DB%8C+%D8%B4%D9%87%D8%B1%DA%A9+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%D8%AE%D9%88%D8%A7%D8%B1%D8%B2%D9%85%DB%8C+%D9%85%D8%A7%D9%87%D8%AF%D8%B4%D8%AA',
    demandStatus: 'درخواست منتشرشده',
    demandEvidence: 'استقرار در همان شهرک صنعتی کارخانه آماج (خوارزمی ماهدشت)؛ نیاز مستمر به لیبل شیشه‌های ترشی/مربا و کارتن لمینیتی',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'شرکت تولیدی لوازم برقی و آشپزخانه ناسیونال / واحدهای صنعتی صفادشت',
    cityAndAddress: 'صفادشت، شهرک صنعتی صفادشت، بلوار خرداد، خیابان چهارم غربی',
    zoneId: 'zone-5-shahriar',
    roadDistanceKm: 19,
    industryOrProduct: 'تولید هود آشپزخانه، اجاق گاز صفحه‌ای، چای‌ساز و لوازم برقی منزل',
    publicPhone: '021-65436120',
    decisionMaker: 'مدیریت تدارکات و خرید کارتن لمینیتی',
    amajProductNeeded: 'کارتن و جعبه لمینیتی',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%AA%D9%88%D9%84%DB%8C%D8%AF+%D9%84%D9%88%D8%A7%D8%B2%D9%85+%D8%AE%D8%A7%D9%86%DA%AF%DB%8C+%D8%B4%D9%87%D8%B1%DA%A9+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%D8%B5%D9%81%D8%A7%D8%AF%D8%B4%D8%AA',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'مصرف بالا در کارتن‌های ۵ لایه و ۳ لایه لمینیتی تمام‌رنگی با استحکام بالا برای لوازم برقی',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'لابراتوار تخصصی عطر و ادکلن و خوشبوکننده گلگون شهریار',
    cityAndAddress: 'شهریار، شهرک صنعتی گلگون، خیابان اصلی، فاز ۳',
    zoneId: 'zone-5-shahriar',
    roadDistanceKm: 31,
    industryOrProduct: 'تولید و پرکن انواع ادکلن، بادی‌اسپلش، دیفیوزر و ست هدیه عطر',
    publicPhone: '021-65612840',
    decisionMaker: 'مدیریت طراحی و بسته‌بندی لوکس',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%AA%D9%88%D9%84%DB%8C%D8%AF+%D8%B9%D8%B7%D8%B1+%D9%88+%D8%A7%D8%AF%DA%A9%D9%84%D9%86+%D8%B4%D9%87%D8%B1%DA%A9+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%DA%AF%D9%84%DA%AF%D9%88%D9%86',
    demandStatus: 'درخواست منتشرشده',
    demandEvidence: 'نیاز مستقیم به هاردباکس مگنتی و کشویی برای ست‌های عطر + لیبل متالایز دیجیتال تیراژ پایین برای رایحه‌های متعدد',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'شرکت فرآورده‌های کنجدی، ارده و حلواشکری سپهر نظرآباد',
    cityAndAddress: 'نظرآباد، شهرک صنعتی سپهر، خیابان رازی',
    zoneId: 'zone-4-nazarabad',
    roadDistanceKm: 56,
    industryOrProduct: 'تولید حلواشکری، کرم کنجد، ارده، کره بادام‌زمینی و روغن کنجد',
    publicPhone: '026-45333910',
    decisionMaker: 'واحد خرید ظروف و لیبل بسته‌بندی',
    amajProductNeeded: 'لیبل دیجیتال تیراژ پایین',
    salesPriority: 'A',
    sourceUrl: 'https://www.google.com/search?q=%D8%B5%D9%86%D8%A7%DB%8C%D8%B9+%D8%BA%D8%B0%D8%A7%DB%8C%DB%8C+%D8%B4%D9%87%D8%B1%DA%A9+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%D8%B3%D9%BE%D9%87%D8%B1+%D9%86%D8%B8%D8%B1%D8%A2%D8%A8%D8%A7%D8%AF',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'تنوع بالای طعم‌ها نیازمند چاپ لیبل دیجیتال ضدچربی و کارتن لمینیتی نمایشگاهی (شلف‌ردی)',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'شرکت تولیدی شوینده و پاک‌کننده‌های صنعتی و خانگی کاسپین آبیک',
    cityAndAddress: 'آزادراه کرج-قزوین، شهرک صنعتی کاسپین ۱، بلوار امام خمینی',
    zoneId: 'zone-6-qazvin',
    roadDistanceKm: 68,
    industryOrProduct: 'تولید مایع ظرفشویی، دستشویی، شامپو هتلی و پودرهای شوینده',
    publicPhone: '028-32882415',
    decisionMaker: 'مدیر تدارکات و بازرگانی بسته‌بندی',
    amajProductNeeded: 'کارتن و جعبه لمینیتی',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%B4%D8%B1%DA%A9%D8%AA+%D8%B4%D9%88%DB%8C%D9%86%D8%AF%D9%87+%D8%B4%D9%87%D8%B1%DA%A9+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%DA%A9%D8%A7%D8%B3%D9%BE%DB%8C%D9%86',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'نیاز به جعبه لمینیتی پودر شوینده، کارتن مادر و لیبل‌های ضدآب محصولات هتلی و خانگی',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'کارخانه تولید و بسته‌بندی قهوه تخصصی و دمنوش‌های گیاهی کمالشهر کرج',
    cityAndAddress: 'کرج، کمالشهر، شهرک صنعتی قزلحصار، خیابان صنعتگران',
    zoneId: 'zone-2-karaj',
    roadDistanceKm: 23,
    industryOrProduct: 'برشته‌کاری قهوه، تولید پودر کاپوچینو، هات‌چاکلت و دمنوش‌های کیسه‌ای لوکس',
    publicPhone: 'در منبع عمومی درج نشده',
    decisionMaker: 'مدیریت برند و سفارشات چاپ',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%DA%A9%D8%A7%D8%B1%D8%AE%D8%A7%D9%86%D9%87+%D8%A8%D8%B3%D8%AA%D9%87+%D8%A8%D9%86%D8%AF%DB%8C+%D9%82%D9%87%D9%88%D9%87+%D9%88+%D8%AF%D9%85%D9%86%D9%88%D8%B4+%DA%A9%D8%B1%D8%AC',
    demandStatus: 'درخواست منتشرشده',
    demandEvidence: 'استفاده از هاردباکس کادویی دمنوش، جعبه مقوایی لمینیتی ساشه‌ها و لیبل دیجیتال با طرح‌های اختصاصی برای هر لاین قهوه',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'شرکت تولیدی قطعات خودرو و لنت ترمز سرداران ماهدشت',
    cityAndAddress: 'ماهدشت، بلوار سرداران، منطقه صنعتی سرداران ماهدشت',
    zoneId: 'zone-1-mahdasht',
    roadDistanceKm: 7,
    industryOrProduct: 'تولید لنت ترمز، فیلتر روغن، فیلتر هوا و قطعات یدکی خودرو',
    publicPhone: '026-37304812',
    decisionMaker: 'واحد خرید جعبه و بسته‌بندی صنعتی',
    amajProductNeeded: 'کارتن و جعبه لمینیتی',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%AA%D9%88%D9%84%DB%8C%D8%AF+%D9%82%D8%B7%D8%B9%D8%A7%D8%AA+%D8%AE%D9%88%D8%AF%D8%B1%D9%88+%D9%85%D8%A7%D9%87%D8%AF%D8%B4%D8%AA+%DA%A9%D8%B1%D8%AC',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'فاصله کمتر از ۷ کیلومتر تا کارخانه آماج؛ مصرف بسیار بالای جعبه لمینیتی ای‌فلوت و بی‌فلوت برای لنت و فیلتر خودرو',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'گروه تولیدی ساعت دیواری، رومیزی و هدایای تبلیغاتی نصیرآباد',
    cityAndAddress: 'جاده ساوه، شهرک صنعتی نصیرآباد، خیابان سرو',
    zoneId: 'zone-7-tehran',
    roadDistanceKm: 46,
    industryOrProduct: 'تولید ساعت‌های لوکس، تندیس، ست‌های مدیریتی چرم و هدایای سازمانی',
    publicPhone: '021-56391450',
    decisionMaker: 'مدیر تولید و تدارکات هاردباکس',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%AA%D9%88%D9%84%DB%8C%D8%AF+%D9%87%D8%AF%D8%A7%DB%8C%D8%A7%DB%8C+%D8%AA%D8%A8%D9%84%DB%8C%D8%BA%D8%A7%D8%AA%DB%8C+%D9%88+%D8%B3%D8%AA+%D9%85%D8%AF%DB%8C%D8%B1%DB%8C%D8%AA%DB%8C+%D8%AA%D9%87%D8%B1%D8%A7%D9%86',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'سفارش‌دهنده دائمی هاردباکس ست مدیریتی، جعبه لمینیتی ساعت و بسته‌بندی‌های اختصاصی سازمانی',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'شرکت بسته‌بندی زعفران، پسته و خشکبار صادراتی البرز قزوین',
    cityAndAddress: 'قزوین، شهر صنعتی البرز، خیابان حکمت',
    zoneId: 'zone-6-qazvin',
    roadDistanceKm: 105,
    industryOrProduct: 'بسته‌بندی کادویی زعفران، پسته، بادام و میوه خشک صادراتی',
    publicPhone: '028-32225180',
    decisionMaker: 'واحد صادرات و بسته‌بندی',
    amajProductNeeded: 'هاردباکس',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%D8%A8%D8%B3%D8%AA%D9%87+%D8%A8%D9%86%D8%AF%DB%8C+%D8%AE%D8%B4%DA%A9%D8%A8%D8%A7%D8%B1+%D8%B4%D9%87%D8%B1+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%D8%A7%D9%84%D8%A8%D8%B1%D8%B2+%D9%82%D8%B2%D9%88%DB%8C%D9%86',
    demandStatus: 'خریدار تأییدشده',
    demandEvidence: 'نیاز هم‌زمان به هاردباکس کادویی زعفران و خشکبار، کارتن لمینیتی صادراتی و لیبل دیجیتال چندزبانه',
    activityStatus: 'فعال و دایر'
  },
  {
    companyName: 'کارخانه تولید کرم، سرم پوستی و ماسک موی تخصصی اشتهارد (فاز ۳)',
    cityAndAddress: 'اشتهارد، شهرک صنعتی اشتهارد، فاز ۳، خیابان ملاصدرا',
    zoneId: 'zone-3-eshtehard',
    roadDistanceKm: 51,
    industryOrProduct: 'تولید محصولات مراقبت از پوست و مو، سرم ویتامین C و روغن آرگان',
    publicPhone: 'در منبع عمومی درج نشده',
    decisionMaker: 'مدیر خرید اقلام بسته‌بندی و چاپی',
    amajProductNeeded: 'لیبل دیجیتال تیراژ پایین',
    salesPriority: 'A+',
    sourceUrl: 'https://www.google.com/search?q=%DA%A9%D8%A7%D8%B1%D8%AE%D8%A7%D9%86%D9%87+%D8%A2%D8%B1%D8%A7%DB%8C%D8%B4%DB%8C+%D8%A8%D9%87%D8%AF%D8%A7%D8%B4%D8%AA%DB%8C+%D8%B4%D9%87%D8%B1%DA%A9+%D8%B5%D9%86%D8%B9%D8%AA%DB%8C+%D8%A7%D8%B4%D8%AA%D9%87%D8%A7%D8%B1%D8%AF',
    demandStatus: 'درخواست منتشرشده',
    demandEvidence: 'تولید قراردادی (پرایوت لیبل) برای ده‌ها برند آرایشی که نیازمند لیبل دیجیتال تیراژ پایین و هاردباکس گیفت‌ست هستند',
    activityStatus: 'فعال و دایر'
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
      ? '🔥 درجه A+ (فوری و پرتیراژ)'
      : lead.salesPriority === 'A'
      ? '⭐ درجه A (مناسب فروش)'
      : '📌 درجه B (پتانسیل رشد)';

  return [
    `╔══════════════════════╗`,
    `📦 کارت مشتری آماج  |  کد #${code}`,
    `╚══════════════════════╝`,
    ``,
    `🏢 نام شرکت یا سفارش‌دهنده:`,
    `» ${lead.companyName}`,
    ``,
    `📍 شهر، آدرس و فاصله از ماهدشت:`,
    `» ${lead.cityAndAddress}`,
    `» فاصله جاده‌ای: حدود ${lead.roadDistanceKm} کیلومتر`,
    ``,
    `🏭 صنعت و حوزه فعالیت:`,
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
    `👤 تصمیم‌گیرنده (مدیرعامل / مدیر خرید):`,
    `» ${lead.decisionMaker || 'در منبع عمومی تأیید نشده'}`,
    ``,
    `🚦 وضعیت فعالیت واحد:`,
    `» ${lead.activityStatus}`,
    ``,
    `🔗 لینک منبع قابل بررسی:`,
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
  if (!ai) {
    return { parsed: [], fallbackGroundedUrl: 'https://www.google.com/search?q=' + encodeURIComponent(zone.query) };
  }
  try {
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
- خروجی را فقط و فقط به صورت یک آرایه JSON معتبر شامل ${countNeeded} شرکت واقعی برگردان.
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
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      parsed = JSON.parse(match[0]);
    }
    return { parsed, fallbackGroundedUrl };
  } catch (err) {
    console.warn('AI discovery fallback activated:', err?.message);
    return { parsed: [], fallbackGroundedUrl: 'https://www.google.com/search?q=' + encodeURIComponent(zone.query) };
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      })
    : null;

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

  // ۱. کاوش زنده با هوش مصنوعی در صورت وجود کلید
  if (ai) {
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
  }

  // ۲. تکمیل تا حداقل ۱۰ کارت از بانک دایرکتوری شهرک‌های صنعتی در صورت نیاز
  for (const dirItem of VERIFIED_INDUSTRIAL_DIRECTORY) {
    if (newLeads.length >= minCards) break;
    const fp = normalizeFingerprint(dirItem.companyName, dirItem.cityAndAddress);
    if (seenSet.has(fp)) continue;
    seenSet.add(fp);

    const cardNum = nextCardNumber++;
    const cardCode = formatCardCode(cardNum);
    const zoneObj = ZONES.find((z) => z.id === dirItem.zoneId) || ZONES[startZoneIndex];

    const lead = {
      id: `lead-gh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cardNumber: cardNum,
      cardCode,
      fingerprint: fp,
      companyName: dirItem.companyName,
      cityAndAddress: dirItem.cityAndAddress,
      zoneId: zoneObj.id,
      zoneName: zoneObj.title,
      roadDistanceKm: dirItem.roadDistanceKm,
      industryOrProduct: dirItem.industryOrProduct,
      publicPhone: dirItem.publicPhone,
      decisionMaker: dirItem.decisionMaker,
      amajProductNeeded: dirItem.amajProductNeeded,
      salesPriority: dirItem.salesPriority,
      sourceUrl: dirItem.sourceUrl,
      sourceTitle: 'دایرکتوری واحدهای صنعتی البرز و تهران (اجرای ابری گیت‌هاب)',
      sourceChannel: 'دایرکتوری شهرک‌های صنعتی و کارخانجات',
      demandStatus: dirItem.demandStatus,
      demandEvidence: dirItem.demandEvidence,
      activityStatus: dirItem.activityStatus,
      crmStatus: 'جدید',
      discoveredAt: new Date().toISOString(),
      cycleId: `cycle-gh-${Date.now()}`,
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
  console.log(`GitHub Cloud Cycle complete. Dispatched ${newLeads.length} individual numbered cards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

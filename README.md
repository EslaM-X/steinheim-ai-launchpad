# Steinheim AI Launchpad

يلا نبدأ صح من أول مرة. هدفنا خلال أسبوعين يكون عندك AI Marketing System لشركة Steinheim يعمل بشكل شبه تلقائي.

المرحلة 1 (اليوم الأول) - تجهيز البيئة

أنشئ الحسابات التالية:

 ✅ n8n (يفضل Self-Hosted إذا عندك VPS، أو Cloud كبداية)

 ✅ Lovable.dev

 ✅ GitHub

 ✅ Supabase

 ✅ OpenAI API

 ✅ Meta Developers (Facebook + Instagram)

 ✅ LinkedIn Developer

المرحلة 2 - بناء قاعدة المعرفة

داخل Supabase سننشئ جداول مثل:

 المنتجات

 الفئات

 العملاء المستهدفون

 المشاريع

 صور المنتجات

 أفكار المحتوى

 المنشورات

 التحليلات

سيعرف النظام كل شيء عن Steinheim حتى يكتب محتوى صحيح.

المرحلة 3 - أول AI Agent

سنبني Agent اسمه:

Steinheim Content Strategist

وظيفته:

 يختار موضوع اليوم.

 يحدد الهدف (بيع / توعية / علامة تجارية).

 يختار المنتج المناسب.

المرحلة 4 - فريق الوكلاء

بعد ذلك نضيف:

 🔍 Research Agent

 ✍️ Copywriter Agent

 🎨 Image Prompt Agent

 ✅ Reviewer Agent

 📅 Publisher Agent

 📊 Analytics Agent

المرحلة 5 - لوحة التحكم

باستخدام Lovable.dev نبني Dashboard فيها:

 المنتجات

 تقويم المحتوى

 زر "Generate Today"

 زر "Publish"

 الإحصائيات

 سجل جميع المنشورات

المرحلة 6 - الأتمتة

كل يوم الساعة 9 صباحًا:

 يبحث عن فكرة.

 يكتب منشور LinkedIn.

 يكتب منشور Facebook.

 يكتب Caption لـ Instagram.

 يقترح أو ينشئ صورة.

 يراجع المحتوى.

 ينشر.

 يحفظ النتائج ويقيس الأداء.

المرحلة 7 - التطوير

بعد نجاح النظام الأساسي نضيف:

 Chatbot للرد على العملاء.

 توليد فيديوهات قصيرة.

 إنشاء عروض أسعار تلقائيًا.

 متابعة الـ Leads.

 إرسال بريد إلكتروني للعملاء المحتملين.

 تقارير أسبوعية وشهرية للإدارة.

نبدأ الآن بأول خطوة

سنبدأ ببناء قاعدة المعرفة (Knowledge Base) لأنها أساس كل شيء. بعدها سنوصلها بـ n8n ثم نبني أول Agent. بهذه الطريقة سيكون النظام قابلًا للتوسع بسهولة بدلًا من إعادة بنائه لاحقًا.

طيب هل اقدر استخدم دا https://github.com/n8n-io/n8n ولا لازم هسجل عن طريق موقعهم برضو واسبوعين مجانين وبس

أيوه، تقدر تستخدم مستودع GitHub مباشرة، ولا أنت مضطر تعتمد على تجربة الأسبوعين في n8n Cloud.

إذا استخدمت مستودع GitHub:

 ✅ مجاني بشكل دائم (Community Edition).

 ✅ تشغله على جهازك أو على VPS.

 ✅ لا يوجد حد 14 يوم.

 ✅ تملك بياناتك وWorkflows بالكامل.

رابط المستودع الذي أرسلته مناسب:

n8n GitHub Repository

أنصحك بإيه؟

بما أنك تريد بناء نظام كبير لـ Steinheim فيه AI Agents وMarketing وDashboard وSupabase، فلا أنصح بالاعتماد على النسخة السحابية التجريبية.

ابدأ مباشرة بـ Self-Hosted:

 Docker (أفضل وأسهل).

 أو npm إذا أردت تشغيله محليًا.

 وبعدها اربطه مع:

 Supabase

 Lovable.dev

 OpenAI

 GitHub

النسخة السحابية من n8n هي التي فيها تجربة 14 يومًا، وبعدها تحتاج اشتراك مدفوع للاستمرار. أما النسخة Self-Hosted فلا تخضع لهذا القيد.

الخطة التي أقترحها لك

 تثبيت n8n بـ Docker.

 إنشاء مشروع GitHub خاص بالنظام.

 ربط Supabase.

 إنشاء أول AI Agent.

 بناء لوحة التحكم في Lovable.dev.

 تشغيل النظام 24/7 على VPS عندما يصبح جاهزًا.

وأعتقد أننا نستطيع بناء منصة تسويق كاملة لـ Steinheim بهذه الأدوات، ثم بعد نجاحها نحولها إلى منتج SaaS تبيعه لشركات أخرى أيضًا.

يعني كده مش هحتاج أنشأ حساب على N8n

بالضبط. إذا اخترت النسخة Self-Hosted، فلن تحتاج إلى إنشاء حساب على موقع n8n.

عند تثبيت n8n من GitHub أو باستخدام Docker:

 ✅ لا تحتاج حساب n8n Cloud.

 ✅ لا توجد فترة تجريبية 14 يومًا.

 ✅ تنشئ حساب محليًا داخل نسختك (اسم مستخدم وكلمة مرور لإدارة النظام).

 ✅ جميع الـ Workflows والبيانات تكون على جهازك أو السيرفر الخاص بك.

أما إذا استخدمت n8n Cloud من موقعهم، فستحتاج إلى:

 إنشاء حساب.

 استخدام الفترة التجريبية.

 ثم الاشتراك إذا أردت الاستمرار.

بما أنك تريد مشروعًا كبيرًا لـ Steinheim

أنصحك أن نبدأ مباشرة بالنسخة Self-Hosted.

أريد أن أعرف فقط:

 هل ستشغله على جهازك الشخصي (Windows) أثناء التطوير؟

 أم لديك VPS أو سيرفر تريد تثبيته عليه من البداية؟

بناءً على إجابتك سأعطيك أسرع طريقة للتثبيت ونبدأ في بناء أول AI Agent.
آه، ينفع تقنيًا تحول موبايل Android قديم إلى سيرفر وتشغّل عليه خدمات، لكن أنا لا أنصح أن نجعل الموبايل هو الـVPS الرئيسي لـ n8n لو هدفنا نظام Steinheim يشتغل 24/7 بشكل احترافي.

الفكرة ممتازة للتجربة والتعلّم، لكن فيها مشاكل:

 🔋 البطارية والاستهلاك المستمر.

 🌡️ الحرارة مع التشغيل 24/7.

 🌐 غالبًا أنت خلف CGNAT، وبالتالي الوصول للموبايل من الإنترنت ليس مباشرًا.

 💤 Android قد يوقف التطبيقات في الخلفية.

 💾 التخزين والـRAM محدودان.

 🔄 إعادة التشغيل أو انقطاع الكهرباء قد يوقف النظام.

 🔐 تعريض Android للإنترنت كسيرفر يحتاج إعداد أمني جيد.

لكن نقدر نستفيد منه جدًا

أقترح نعملها بهذا الشكل:

الموبايل القديم = Development Server

Android Phone
     │
     ├── Termux
     ├── Ubuntu/Debian environment
     ├── Node.js
     ├── n8n
     └── PostgreSQL / أدوات التجربة

ونبني عليه النظام بالكامل ونختبر:

n8n → AI Agents → Supabase → Lovable → APIs → Content Generation

وبعد ما النظام يشتغل تمامًا، ننقله إلى VPS حقيقي.

والأهم

أنت لا تحتاج شراء VPS الآن.

نقدر نبدأ بالموبايل بتكلفة شبه صفرية، ونبني أول نسخة من نظام Steinheim، وبعد ما نتأكد أن كل شيء يعمل، ننقله إلى VPS مناسب.

ولو الموبايل قديم جدًا أو RAM أقل من 3–4GB، فالأفضل نستخدمه فقط للتجارب وليس لتشغيل كل الـAgents والـservices عليه.

وأنا أقترح نبدأ الآن بالموبايل نفسه: نجهزه كسيرفر، ثم نثبت عليه n8n Self-Hosted، وبعدها نعمل أول Workflow لـ Steinheim.

لو الموبايل معاك الآن، ابعتلي الموديل + إصدار Android + RAM، وأنا أقولك بالضبط هل ينفع ولا لأ، والطريقة الأنسب لتحويله لسيرفر.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4094afcd-5bf7-4eb5-8065-6402b599f28f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

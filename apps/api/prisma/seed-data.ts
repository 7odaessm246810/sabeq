/**
 * Seed data copied from the design prototype (`S.site`). Catalog rows are real structure
 * (universities, faculty kinds, departments); mentors are DEMO people for local development only.
 */
import type { FacultyCategory, MentorKind, UniversityType } from '../src/generated/prisma/enums.js';

export const UNIVERSITIES: {
  slug: string;
  nameAr: string;
  nameEn: string;
  type: UniversityType;
  governorate: string;
}[] = [
  {
    slug: 'cairo',
    nameAr: 'جامعة القاهرة',
    nameEn: 'Cairo University',
    type: 'public',
    governorate: 'الجيزة',
  },
  {
    slug: 'ain-shams',
    nameAr: 'جامعة عين شمس',
    nameEn: 'Ain Shams University',
    type: 'public',
    governorate: 'القاهرة',
  },
  {
    slug: 'alexandria',
    nameAr: 'جامعة الإسكندرية',
    nameEn: 'Alexandria University',
    type: 'public',
    governorate: 'الإسكندرية',
  },
  {
    slug: 'mansoura',
    nameAr: 'جامعة المنصورة',
    nameEn: 'Mansoura University',
    type: 'public',
    governorate: 'الدقهلية',
  },
  {
    slug: 'assiut',
    nameAr: 'جامعة أسيوط',
    nameEn: 'Assiut University',
    type: 'public',
    governorate: 'أسيوط',
  },
  {
    slug: 'helwan',
    nameAr: 'جامعة حلوان',
    nameEn: 'Helwan University',
    type: 'public',
    governorate: 'القاهرة',
  },
];

export interface KindSeed {
  slug: string;
  nameAr: string;
  fullNameAr: string;
  icon: string;
  category: FacultyCategory;
  studyYears: number;
  summary: string;
  about: string;
  genericInfo: string;
  departments: string[];
  insights: string[];
}

export const FACULTY_KINDS: KindSeed[] = [
  {
    slug: 'eng',
    nameAr: 'الهندسة',
    fullNameAr: 'كلية الهندسة',
    icon: 'gear',
    category: 'engineering',
    studyYears: 5,
    summary: 'مدني، عمارة، كهرباء، حاسبات، ميكانيكا',
    about: 'خمس سنين، أولهم سنة إعدادي مشتركة، وبعدها بتتوزع على الأقسام حسب مجموعك وترتيب رغباتك.',
    genericInfo:
      'مدة الدراسة خمس سنوات تشمل سنة إعدادية، وتضم أقسام الهندسة المدنية والمعمارية والكهربائية والميكانيكية.',
    departments: [
      'هندسة الحاسبات',
      'اتصالات وإلكترونيات',
      'مدني',
      'عمارة',
      'ميكانيكا',
      'كهرباء قوى',
    ],
    insights: [
      '«الإعدادي صعب مش عشان المواد، عشان أول مرة محدش بيتابعك.»',
      '«ترتيبك في الإعدادي هو اللي بيحدد قسمك. خلي بالك من أول ترم.»',
      '«المشاريع في قسم عمارة بتاخد ليالي كاملة — اعرف ده قبل ما تختاره.»',
    ],
  },
  {
    slug: 'med',
    nameAr: 'الطب',
    fullNameAr: 'كلية الطب البشري',
    icon: 'pulse',
    category: 'medical',
    studyYears: 7,
    summary: 'خمس سنين دراسة + سنتين امتياز',
    about:
      'النظام الجديد: خمس سنين دراسة بنظام الموديولات، وبعدها سنتين امتياز في المستشفيات الجامعية.',
    genericInfo:
      'تبلغ مدة الدراسة خمس سنوات يليها عامان امتياز، وتشمل المواد الأساسية والإكلينيكية.',
    departments: ['السنوات الأساسية', 'السنوات الإكلينيكية', 'الامتياز'],
    insights: [
      '«أول سنتين أغلبهم حفظ ومعامل. الإكلينيكي الحقيقي بيبدأ متأخر.»',
      '«مصاريف الكتب والأدوات أكتر ما تتخيل — حط ميزانية من الأول.»',
      '«لو نفَسك طويل هتحبها. لو مستعجل على النتيجة هتتعب.»',
    ],
  },
  {
    slug: 'pharm',
    nameAr: 'الصيدلة',
    fullNameAr: 'كلية الصيدلة',
    icon: 'pill',
    category: 'medical',
    studyYears: 6,
    summary: 'فارم دي، إكلينيكي، صناعة الدواء',
    about: 'برنامج فارم دي: خمس سنين دراسة وسنة تدريب، مع مسار إكلينيكي ومسار صناعي.',
    genericInfo: 'تمنح الكلية درجة بكالوريوس الصيدلة (فارم دي) بعد ست سنوات منها سنة تدريب.',
    departments: ['فارم دي', 'صيدلة إكلينيكية'],
    insights: [
      '«الكيمياء العضوية في سنة أولى هي اللي بتفرز.»',
      '«الشغل مش صيدلية بس — في شركات ومصانع وبحث.»',
    ],
  },
  {
    slug: 'dent',
    nameAr: 'طب الأسنان',
    fullNameAr: 'كلية طب الأسنان',
    icon: 'tooth',
    category: 'medical',
    studyYears: 6,
    summary: 'دراسة عملية، معامل، وعيادة',
    about: 'خمس سنين وسنة امتياز، والجزء العملي بيبدأ بدري في المعامل قبل العيادة.',
    genericInfo: 'الدراسة خمس سنوات تليها سنة امتياز، وتشمل مقررات نظرية وعملية.',
    departments: ['السنوات الأساسية', 'العيادات'],
    insights: [
      '«الخامات والأدوات عليك — دي أكبر مفاجأة.»',
      '«إيدك لازم تبقى ثابتة. هتعرف ده في المعمل بدري.»',
    ],
  },
  {
    slug: 'cs',
    nameAr: 'حاسبات ومعلومات',
    fullNameAr: 'كلية الحاسبات والمعلومات',
    icon: 'code',
    category: 'engineering',
    studyYears: 4,
    summary: 'علوم حاسب، نظم، ذكاء اصطناعي',
    about:
      'أربع سنين، سنتين عام وبعدهم تخصص: علوم حاسب، نظم معلومات، تكنولوجيا معلومات، أو ذكاء اصطناعي.',
    genericInfo:
      'تضم الكلية أقسام علوم الحاسب ونظم المعلومات وتكنولوجيا المعلومات، ومدة الدراسة أربع سنوات.',
    departments: ['علوم الحاسب', 'نظم المعلومات', 'ذكاء اصطناعي', 'تكنولوجيا المعلومات'],
    insights: [
      '«الكلية بتديك الأساس. الشغل الحقيقي بتتعلمه من المشاريع برا المنهج.»',
      '«الرياضيات أهم مما الناس بتقول.»',
    ],
  },
  {
    slug: 'com',
    nameAr: 'التجارة',
    fullNameAr: 'كلية التجارة',
    icon: 'chart',
    category: 'literary',
    studyYears: 4,
    summary: 'محاسبة، إدارة، اقتصاد، شعب لغات',
    about: 'أربع سنين، شعبة عربي أو إنجليزي، والتخصص بيبدأ في سنة تالتة.',
    genericInfo:
      'تضم كلية التجارة شعب المحاسبة وإدارة الأعمال والاقتصاد، بالإضافة إلى برامج بالإنجليزية.',
    departments: ['محاسبة', 'إدارة أعمال', 'اقتصاد'],
    insights: [
      '«الفرق الحقيقي بين اللي بيشتغل وهو بيدرس واللي لأ.»',
      '«الشعبة الإنجليزي بتفرق في أول شغل.»',
    ],
  },
  {
    slug: 'media',
    nameAr: 'الإعلام',
    fullNameAr: 'كلية الإعلام',
    icon: 'mic',
    category: 'literary',
    studyYears: 4,
    summary: 'صحافة، إذاعة وتلفزيون، علاقات عامة',
    about: 'أربع سنين، والتخصص من سنة تانية: صحافة، إذاعة وتلفزيون، أو علاقات عامة وإعلان.',
    genericInfo: 'تؤهل الكلية الطلاب للعمل في الصحافة والإذاعة والتلفزيون والعلاقات العامة.',
    departments: ['صحافة', 'إذاعة وتلفزيون', 'علاقات عامة وإعلان'],
    insights: ['«التدريب من سنة تانية هو اللي بيعمل الفرق.»', '«البورتفوليو أهم من التقدير.»'],
  },
  {
    slug: 'law',
    nameAr: 'الحقوق',
    fullNameAr: 'كلية الحقوق',
    icon: 'scale',
    category: 'literary',
    studyYears: 4,
    summary: 'قانون عام وخاص، شعب لغات',
    about: 'أربع سنين، فيها شعبة عربي وشعب لغات (إنجليزي وفرنسي).',
    genericInfo: 'مدة الدراسة أربع سنوات، وتشمل القانون العام والقانون الخاص.',
    departments: ['شعبة عربي', 'شعبة إنجليزي', 'شعبة فرنسي'],
    insights: [
      '«المذاكرة قراءة كتير جدًا. لو مش بتحب القراءة فكّر تاني.»',
      '«التدريب في مكتب محاماة بدري بيوضحلك الطريق.»',
    ],
  },
  {
    slug: 'sci',
    nameAr: 'العلوم',
    fullNameAr: 'كلية العلوم',
    icon: 'pulse',
    category: 'science',
    studyYears: 4,
    summary: 'كيمياء، فيزياء، أحياء، جيولوجيا',
    about: 'أربع سنين، والتخصص من سنة تانية أو تالتة حسب البرنامج.',
    genericInfo: 'تضم الكلية أقسام الكيمياء والفيزياء والأحياء والجيولوجيا والرياضيات.',
    departments: ['كيمياء', 'بيولوجي', 'فيزياء'],
    insights: ['«المعامل كتير وده حلو لو بتحب البحث.»'],
  },
  {
    slug: 'arch',
    nameAr: 'الفنون الجميلة',
    fullNameAr: 'كلية الفنون الجميلة',
    icon: 'building',
    category: 'arts',
    studyYears: 5,
    summary: 'عمارة، ديكور، جرافيك، تصوير',
    about: 'خمس سنين، بتبدأ باختبار قدرات، والتخصص بعد سنة إعدادي.',
    genericInfo: 'تقبل الكلية الطلاب بعد اجتياز اختبار القدرات، وتضم أقسامًا فنية متعددة.',
    departments: ['عمارة', 'جرافيك', 'ديكور'],
    insights: ['«اختبار القدرات محتاج تحضير شهور، مش أسابيع.»'],
  },
];

export interface DemoMentor {
  phone: string;
  name: string;
  slug: string;
  kind: MentorKind;
  kindSlug: string;
  universitySlug: string;
  department: string;
  majorLabel: string;
  graduationYear: number;
  rating: string;
  sessions: number;
  priceEgp: number;
  city: string;
  available: boolean;
  bio: string;
  topics: string[];
}

/** Demo mentors (local development only — never seeded in staging/production). */
export const DEMO_MENTORS: DemoMentor[] = [
  {
    phone: '+201000000001',
    name: 'أحمد محمد',
    slug: 'ahmed-mohamed',
    kind: 'graduate',
    kindSlug: 'eng',
    universitySlug: 'cairo',
    department: 'هندسة الحاسبات',
    majorLabel: 'هندسة الحاسبات',
    graduationYear: 2025,
    rating: '4.9',
    sessions: 32,
    priceEgp: 250,
    city: 'الجيزة',
    available: true,
    bio: 'خريج هندسة حاسبات، بشتغل Software Engineer. دخلت الكلية من غير ما أعرف الفرق بين الأقسام، وعايز أوفر عليك الحيرة دي.',
    topics: ['الإعدادي وأول ترم', 'حاسبات ولا اتصالات؟', 'إزاي تذاكر في الكلية', 'التدريب والشغل'],
  },
  {
    phone: '+201000000002',
    name: 'سارة عبد الرحمن',
    slug: 'sara-abdelrahman',
    kind: 'graduate',
    kindSlug: 'med',
    universitySlug: 'ain-shams',
    department: 'الامتياز',
    majorLabel: 'طب وجراحة — امتياز',
    graduationYear: 2024,
    rating: '5.0',
    sessions: 48,
    priceEgp: 300,
    city: 'القاهرة',
    available: true,
    bio: 'طبيبة امتياز. هقولك الحقيقة عن سنين الطب: الحلو والصعب، والمصاريف، وإزاي تحافظ على حياتك وانت بتذاكر.',
    topics: ['أول سنتين طب', 'الامتياز', 'المصاريف الحقيقية', 'طب حكومي ولا خاص؟'],
  },
  {
    phone: '+201000000003',
    name: 'يوسف حسن',
    slug: 'youssef-hassan',
    kind: 'graduate',
    kindSlug: 'cs',
    universitySlug: 'mansoura',
    department: 'علوم الحاسب',
    majorLabel: 'علوم الحاسب',
    graduationYear: 2023,
    rating: '4.8',
    sessions: 21,
    priceEgp: 200,
    city: 'المنصورة',
    available: true,
    bio: 'خريج علوم حاسب وبشتغل في الذكاء الاصطناعي. ممكن أساعدك تختار بين حاسبات وهندسة.',
    topics: ['حاسبات ولا هندسة؟', 'تخصص الذكاء الاصطناعي', 'المشاريع الجانبية'],
  },
  {
    phone: '+201000000004',
    name: 'مريم خالد',
    slug: 'mariam-khaled',
    kind: 'graduate',
    kindSlug: 'pharm',
    universitySlug: 'alexandria',
    department: 'صيدلة إكلينيكية',
    majorLabel: 'صيدلة إكلينيكية',
    graduationYear: 2025,
    rating: '4.9',
    sessions: 17,
    priceEgp: 220,
    city: 'الإسكندرية',
    available: false,
    bio: 'صيدلانية إكلينيكية. الصيدلة مش صيدلية بس — هوريك كل المسارات.',
    topics: ['فارم دي', 'المسار الإكلينيكي', 'الشغل في الشركات'],
  },
  {
    phone: '+201000000005',
    name: 'عمر طارق',
    slug: 'omar-tarek',
    kind: 'graduate',
    kindSlug: 'com',
    universitySlug: 'cairo',
    department: 'محاسبة',
    majorLabel: 'محاسبة — إنجليزي',
    graduationYear: 2022,
    rating: '4.7',
    sessions: 39,
    priceEgp: 180,
    city: 'القاهرة',
    available: true,
    bio: 'محاسب في شركة مراجعة. اتدربت من سنة تانية، وده اللي فرق معايا.',
    topics: ['شعبة عربي ولا إنجليزي؟', 'شهادات المحاسبة', 'التدريب بدري'],
  },
  {
    phone: '+201000000006',
    name: 'نور إبراهيم',
    slug: 'nour-ibrahim',
    kind: 'graduate',
    kindSlug: 'media',
    universitySlug: 'cairo',
    department: 'صحافة',
    majorLabel: 'صحافة رقمية',
    graduationYear: 2024,
    rating: '4.8',
    sessions: 26,
    priceEgp: 200,
    city: 'القاهرة',
    available: true,
    bio: 'صحفية في موقع إخباري. هقولك الكلية بتديك إيه، وإيه اللي لازم تتعلمه برا.',
    topics: ['أقسام الإعلام', 'البورتفوليو', 'التدريب في الجرايد'],
  },
  {
    phone: '+201000000007',
    name: 'كريم سامي',
    slug: 'karim-samy',
    kind: 'teaching_assistant',
    kindSlug: 'eng',
    universitySlug: 'ain-shams',
    department: 'اتصالات وإلكترونيات',
    majorLabel: 'اتصالات وإلكترونيات',
    graduationYear: 2024,
    rating: '4.8',
    sessions: 19,
    priceEgp: 230,
    city: 'القاهرة',
    available: true,
    bio: 'معيد في قسم اتصالات. لو بتحب البرمجة والإلكترونيات مع بعض، تعالى نتكلم.',
    topics: ['قسم اتصالات', 'الإعدادي', 'الشغل في شركات الاتصالات'],
  },
  {
    phone: '+201000000008',
    name: 'هبة عادل',
    slug: 'heba-adel',
    kind: 'graduate',
    kindSlug: 'eng',
    universitySlug: 'alexandria',
    department: 'عمارة',
    majorLabel: 'هندسة معمارية',
    graduationYear: 2023,
    rating: '4.9',
    sessions: 34,
    priceEgp: 260,
    city: 'الإسكندرية',
    available: true,
    bio: 'معمارية. هوريك شكل المشاريع والسهر الحقيقي في قسم عمارة.',
    topics: ['قسم عمارة', 'المشاريع والسهر', 'البرامج المطلوبة'],
  },
  {
    phone: '+201000000009',
    name: 'محمود رضا',
    slug: 'mahmoud-reda',
    kind: 'graduate',
    kindSlug: 'dent',
    universitySlug: 'mansoura',
    department: 'العيادات',
    majorLabel: 'طب الأسنان',
    graduationYear: 2024,
    rating: '4.7',
    sessions: 15,
    priceEgp: 240,
    city: 'المنصورة',
    available: true,
    bio: 'طبيب أسنان. الكلية عملية جدًا ومكلفة — خليني أوضحلك.',
    topics: ['الخامات والمصاريف', 'المعامل', 'خاص ولا حكومي؟'],
  },
  {
    phone: '+201000000010',
    name: 'ياسمين فؤاد',
    slug: 'yasmin-fouad',
    kind: 'graduate',
    kindSlug: 'law',
    universitySlug: 'ain-shams',
    department: 'شعبة إنجليزي',
    majorLabel: 'حقوق — شعبة إنجليزي',
    graduationYear: 2023,
    rating: '4.8',
    sessions: 22,
    priceEgp: 190,
    city: 'القاهرة',
    available: true,
    bio: 'محامية في مكتب دولي. هقولك الفرق بين الشعب وفرص كل واحدة.',
    topics: ['الشعب اللغات', 'التدريب في المكاتب', 'المذاكرة في الحقوق'],
  },
  {
    phone: '+201000000011',
    name: 'إسلام جمال',
    slug: 'islam-gamal',
    kind: 'professor',
    kindSlug: 'med',
    universitySlug: 'assiut',
    department: 'السنوات الإكلينيكية',
    majorLabel: 'طب وجراحة',
    graduationYear: 2015,
    rating: '4.9',
    sessions: 41,
    priceEgp: 280,
    city: 'أسيوط',
    available: true,
    bio: 'مدرس بكلية الطب. درست ودرّست برا القاهرة وعايز أقولك الفرق الحقيقي.',
    topics: ['الدراسة برا القاهرة', 'السنين الإكلينيكية', 'النيابة'],
  },
  {
    phone: '+201000000012',
    name: 'رنا مصطفى',
    slug: 'rana-mostafa',
    kind: 'graduate',
    kindSlug: 'cs',
    universitySlug: 'cairo',
    department: 'نظم المعلومات',
    majorLabel: 'نظم المعلومات',
    graduationYear: 2025,
    rating: '4.6',
    sessions: 9,
    priceEgp: 170,
    city: 'الجيزة',
    available: true,
    bio: 'لسه متخرجة. فاكرة كل تفاصيل التنسيق والحيرة كويس.',
    topics: ['التنسيق والرغبات', 'نظم ولا علوم حاسب؟'],
  },
];

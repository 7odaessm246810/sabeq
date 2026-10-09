/**
 * Every institution the Ministry of Higher Education recognises (official lists, 2026), plus
 * Al-Azhar (its own law). Names exactly as published.
 *
 * Sources (checked 2026-10-09):
 *  - Ministry list via the National Media Authority, 2026-07-19 (Arabic names):
 *    https://www.maspero.eg/reports-egypt/2026/07/19/972908/
 *  - Updated list via the State Information Service, 2026-08-14 (38 private universities):
 *    https://sis.gov.eg/ar/مصر/المجتمع/التعليم/القوائم-المحدثة-لمؤسسات-التعليم-العالي-المعتمدة-بجمهورية-مصر-العربية/
 * Governorates and websites are filled only where known with confidence; otherwise left empty.
 */
import type { UniversityType } from '../../src/generated/prisma/enums.js';

export const UNIVERSITY_LIST_SOURCE = 'https://www.maspero.eg/reports-egypt/2026/07/19/972908/';

export interface UniversitySeed {
  slug: string;
  nameAr: string;
  nameEn?: string;
  type: UniversityType;
  governorate?: string;
  website?: string;
  /** Earlier slugs this row may exist under (renames keep their database id). */
  formerSlugs?: string[];
}

const pub = (
  slug: string,
  nameAr: string,
  nameEn: string,
  governorate: string,
  website?: string,
  formerSlugs?: string[],
): UniversitySeed => ({
  slug,
  nameAr,
  nameEn,
  type: 'public',
  governorate,
  ...(website ? { website } : {}),
  ...(formerSlugs ? { formerSlugs } : {}),
});

export const PUBLIC_UNIVERSITIES: UniversitySeed[] = [
  pub('cairo', 'جامعة القاهرة', 'Cairo University', 'الجيزة', 'https://cu.edu.eg'),
  pub(
    'alexandria',
    'جامعة الإسكندرية',
    'Alexandria University',
    'الإسكندرية',
    'https://alexu.edu.eg',
  ),
  pub('ain-shams', 'جامعة عين شمس', 'Ain Shams University', 'القاهرة', 'https://asu.edu.eg'),
  pub('assiut', 'جامعة أسيوط', 'Assiut University', 'أسيوط', 'https://aun.edu.eg'),
  pub('tanta', 'جامعة طنطا', 'Tanta University', 'الغربية', 'https://tanta.edu.eg'),
  pub('mansoura', 'جامعة المنصورة', 'Mansoura University', 'الدقهلية', 'https://mans.edu.eg'),
  pub('zagazig', 'جامعة الزقازيق', 'Zagazig University', 'الشرقية', 'https://zu.edu.eg'),
  // Renamed from Helwan University; same institution and campus.
  pub(
    'capital',
    'جامعة العاصمة',
    'Capital University (formerly Helwan)',
    'القاهرة',
    'https://helwan.edu.eg',
    ['helwan'],
  ),
  pub('minia', 'جامعة المنيا', 'Minia University', 'المنيا', 'https://minia.edu.eg'),
  pub('menoufia', 'جامعة المنوفية', 'Menoufia University', 'المنوفية', 'https://menofia.edu.eg'),
  pub('suez-canal', 'جامعة قناة السويس', 'Suez Canal University', 'الإسماعيلية', 'https://scu.eg'),
  // Renamed from South Valley University.
  pub('qena', 'جامعة قنا', 'Qena University (formerly South Valley)', 'قنا', 'https://svu.edu.eg'),
  pub('beni-suef', 'جامعة بني سويف', 'Beni-Suef University', 'بني سويف', 'https://bsu.edu.eg'),
  pub('fayoum', 'جامعة الفيوم', 'Fayoum University', 'الفيوم', 'https://fayoum.edu.eg'),
  pub('benha', 'جامعة بنها', 'Benha University', 'القليوبية', 'https://bu.edu.eg'),
  pub(
    'kafrelsheikh',
    'جامعة كفر الشيخ',
    'Kafrelsheikh University',
    'كفر الشيخ',
    'https://kfs.edu.eg',
  ),
  pub('sohag', 'جامعة سوهاج', 'Sohag University', 'سوهاج', 'https://sohag-univ.edu.eg'),
  pub('port-said', 'جامعة بورسعيد', 'Port Said University', 'بورسعيد', 'https://psu.edu.eg'),
  pub('damanhour', 'جامعة دمنهور', 'Damanhour University', 'البحيرة', 'https://damanhour.edu.eg'),
  pub('aswan', 'جامعة أسوان', 'Aswan University', 'أسوان', 'https://aswu.edu.eg'),
  pub('damietta', 'جامعة دمياط', 'Damietta University', 'دمياط', 'https://du.edu.eg'),
  pub('suez', 'جامعة السويس', 'Suez University', 'السويس', 'https://suezuni.edu.eg'),
  pub(
    'sadat-city',
    'جامعة مدينة السادات',
    'University of Sadat City',
    'المنوفية',
    'https://usc.edu.eg',
  ),
  pub('arish', 'جامعة العريش', 'Arish University', 'شمال سيناء', 'https://aru.edu.eg'),
  pub(
    'new-valley',
    'جامعة الوادي الجديد',
    'New Valley University',
    'الوادي الجديد',
    'https://nvu.edu.eg',
  ),
  pub('matrouh', 'جامعة مطروح', 'Matrouh University', 'مطروح'),
  pub('luxor', 'جامعة الأقصر', 'Luxor University', 'الأقصر'),
  pub('hurghada', 'جامعة الغردقة', 'Hurghada University', 'البحر الأحمر'),
];

export const AZHAR: UniversitySeed = {
  slug: 'azhar',
  nameAr: 'جامعة الأزهر',
  nameEn: 'Al-Azhar University',
  type: 'azhar',
  governorate: 'القاهرة',
  website: 'https://azhar.edu.eg',
};

const priv = (slug: string, nameAr: string, governorate?: string): UniversitySeed => ({
  slug,
  nameAr,
  type: 'private',
  ...(governorate ? { governorate } : {}),
});

export const PRIVATE_UNIVERSITIES: UniversitySeed[] = [
  priv('october-6', 'جامعة 6 أكتوبر', 'الجيزة'),
  priv('msa', 'جامعة أكتوبر للعلوم الحديثة والآداب', 'الجيزة'),
  priv('must', 'جامعة مصر للعلوم والتكنولوجيا', 'الجيزة'),
  priv('miu', 'جامعة مصر الدولية', 'القاهرة'),
  priv('guc', 'الجامعة الألمانية بالقاهرة', 'القاهرة'),
  priv('acu', 'جامعة الأهرام الكندية', 'الجيزة'),
  priv('bue', 'الجامعة البريطانية في مصر', 'القاهرة'),
  priv('mti', 'الجامعة الحديثة للتكنولوجيا والمعلومات', 'القاهرة'),
  priv('sinai', 'جامعة سيناء'),
  priv('pharos', 'جامعة فاروس بالإسكندرية', 'الإسكندرية'),
  priv('nahda', 'جامعة النهضة ببني سويف', 'بني سويف'),
  priv('fue', 'جامعة المستقبل', 'القاهرة'),
  priv('eru', 'الجامعة المصرية الروسية', 'القاهرة'),
  priv('deltauniv', 'جامعة الدلتا للعلوم والتكنولوجيا بجمصة', 'الدقهلية'),
  priv('heliopolis', 'جامعة هليوبوليس', 'القاهرة'),
  priv('ngu', 'جامعة الجيزة الجديدة', 'الجيزة'),
  priv('deraya', 'جامعة دراية بالمنيا', 'المنيا'),
  priv('badr', 'جامعة بدر', 'القاهرة'),
  priv('horus', 'جامعة حورس', 'دمياط'),
  priv('ecu', 'الجامعة المصرية الصينية', 'القاهرة'),
  priv('merit', 'جامعة ميريت', 'سوهاج'),
  priv('sphinx', 'جامعة سفنكس', 'أسيوط'),
  priv('salam', 'جامعة السلام'),
  priv('badr-assiut', 'جامعة بدر بأسيوط', 'أسيوط'),
  priv('new-salhia', 'جامعة الصالحية الجديدة', 'الشرقية'),
  priv('hayah', 'جامعة الحياة'),
  priv('mayo', 'جامعة مايو'),
  priv('riyada', 'جامعة الريادة للعلوم والتكنولوجيا بمدينة السادات', 'المنوفية'),
  priv('ibtikar', 'جامعة الابتكار'),
  priv('madina-cairo', 'جامعة المدينة بالقاهرة', 'القاهرة'),
  priv('rashid', 'جامعة رشيد', 'البحيرة'),
  priv('badya', 'جامعة باديا'),
  priv('nile-valley-fayoum', 'جامعة وادي النيل بالفيوم', 'الفيوم'),
  priv('lotus', 'جامعة اللوتس'),
  priv('obour-st', 'جامعة العبور للعلوم والتكنولوجيا', 'القليوبية'),
  priv('memphis', 'جامعة ممفيس'),
  priv('east-capital', 'جامعة شرق العاصمة'),
];

const ahl = (slug: string, nameAr: string, governorate?: string): UniversitySeed => ({
  slug,
  nameAr,
  type: 'national',
  ...(governorate ? { governorate } : {}),
});

export const AHLIYA_UNIVERSITIES: UniversitySeed[] = [
  ahl('ksiu', 'جامعة الملك سلمان الدولية', 'جنوب سيناء'),
  ahl('aiu', 'جامعة العلمين الدولية', 'مطروح'),
  ahl('galala', 'جامعة الجلالة', 'السويس'),
  ahl('nmu', 'جامعة المنصورة الجديدة', 'الدقهلية'),
  ahl('eelu', 'الجامعة المصرية للتعلم الإلكتروني الأهلية'),
  ahl('nu', 'جامعة النيل الأهلية', 'الجيزة'),
  ahl('ufe', 'الجامعة الأهلية الفرنسية في مصر', 'القاهرة'),
  ahl('eui', 'جامعة مصر للمعلوماتية'),
  ahl('capital-ahl', 'جامعة حلوان الأهلية', 'القاهرة'),
  ahl('mansoura-ahl', 'جامعة المنصورة الأهلية', 'الدقهلية'),
  ahl('benha-ahl', 'جامعة بنها الأهلية', 'القليوبية'),
  ahl('menoufia-ahl', 'جامعة المنوفية الأهلية', 'المنوفية'),
  ahl('beni-suef-ahl', 'جامعة بني سويف الأهلية', 'بني سويف'),
  ahl('assiut-ahl', 'جامعة أسيوط الأهلية', 'أسيوط'),
  ahl('qena-ahl', 'جامعة جنوب الوادي الأهلية', 'قنا'),
  ahl('minia-ahl', 'جامعة المنيا الأهلية', 'المنيا'),
  ahl('east-port-said-ahl', 'جامعة شرق بورسعيد الأهلية', 'بورسعيد'),
  ahl('alexandria-ahl', 'جامعة الإسكندرية الأهلية', 'الإسكندرية'),
  ahl('zagazig-ahl', 'جامعة الزقازيق الأهلية', 'الشرقية'),
  ahl('new-ismailia-ahl', 'جامعة الإسماعيلية الجديدة الأهلية', 'الإسماعيلية'),
  ahl('suez-ahl', 'جامعة السويس الأهلية', 'السويس'),
  ahl('damanhour-ahl', 'جامعة دمنهور الأهلية', 'البحيرة'),
  ahl('cairo-ahl', 'جامعة القاهرة الأهلية', 'الجيزة'),
  ahl('ain-shams-ahl', 'جامعة عين شمس الأهلية', 'القاهرة'),
  ahl('sohag-ahl', 'جامعة سوهاج الأهلية', 'سوهاج'),
  ahl('kafrelsheikh-ahl', 'جامعة كفر الشيخ الأهلية', 'كفر الشيخ'),
  ahl('new-valley-ahl', 'جامعة الوادي الجديد الأهلية', 'الوادي الجديد'),
  ahl('fayoum-ahl', 'جامعة الفيوم الأهلية', 'الفيوم'),
  ahl('tanta-ahl', 'جامعة طنطا الأهلية', 'الغربية'),
  ahl('luxor-ahl', 'جامعة الأقصر الأهلية', 'الأقصر'),
  ahl('damietta-ahl', 'جامعة دمياط الأهلية', 'دمياط'),
  ahl('sadat-city-ahl', 'جامعة مدينة السادات الأهلية', 'المنوفية'),
];

const tech = (slug: string, nameAr: string, governorate?: string): UniversitySeed => ({
  slug,
  nameAr,
  type: 'technological',
  ...(governorate ? { governorate } : {}),
});

export const TECHNOLOGICAL_UNIVERSITIES: UniversitySeed[] = [
  tech('new-cairo-tech', 'جامعة القاهرة الجديدة التكنولوجية', 'القاهرة'),
  tech('delta-tech', 'جامعة الدلتا التكنولوجية بقويسنا', 'المنوفية'),
  tech('beni-suef-tech', 'جامعة بني سويف التكنولوجية', 'بني سويف'),
  tech('new-assiut-tech', 'جامعة أسيوط الجديدة التكنولوجية', 'أسيوط'),
  tech('borg-elarab-tech', 'جامعة برج العرب التكنولوجية', 'الإسكندرية'),
  tech('taiba-tech', 'جامعة طيبة التكنولوجية بالأقصر', 'الأقصر'),
  tech('october-6-tech', 'جامعة السادس من أكتوبر التكنولوجية', 'الجيزة'),
  tech('samannoud-tech', 'جامعة سمنود التكنولوجية', 'الغربية'),
  tech('east-port-said-tech', 'جامعة شرق بورسعيد التكنولوجية', 'بورسعيد'),
  // Listed as "<city> Technological" in May 2026 and "<city> International Technological" in the
  // 2026-08-14 update.
  tech('helwan-intl-tech', 'جامعة حلوان التكنولوجية الدولية', 'القاهرة'),
  tech('fayoum-intl-tech', 'جامعة الفيوم التكنولوجية الدولية', 'الفيوم'),
  tech('assiut-intl-tech', 'جامعة أسيوط التكنولوجية الدولية', 'أسيوط'),
  tech('elsewedy-tech', 'جامعة السويدي للتكنولوجيا'),
  tech('saxony-egypt', 'جامعة ساكسوني مصر'),
];

const intl = (slug: string, nameAr: string, governorate?: string): UniversitySeed => ({
  slug,
  nameAr,
  type: 'international',
  ...(governorate ? { governorate } : {}),
});

export const INTERNATIONAL_UNIVERSITIES: UniversitySeed[] = [
  intl('auc', 'الجامعة الأمريكية بالقاهرة', 'القاهرة'),
  intl('ejust', 'الجامعة المصرية اليابانية للعلوم والتكنولوجيا', 'الإسكندرية'),
  intl('giu', 'الجامعة الألمانية الدولية بالعاصمة الإدارية'),
  intl('eslsca', 'جامعة اسلسكا'),
  intl('tu-berlin-gouna', 'جامعة برلين الألمانية بالجونة', 'البحر الأحمر'),
  intl('senghor', 'جامعة سنجور', 'الإسكندرية'),
  intl('aast', 'الأكاديمية العربية للعلوم والتكنولوجيا والنقل البحري', 'الإسكندرية'),
  intl('aou', 'الجامعة العربية المفتوحة'),
  {
    slug: 'zewail',
    nameAr: 'جامعة زويل للعلوم والتكنولوجيا',
    type: 'private',
    governorate: 'الجيزة',
  },
];

export const ALL_UNIVERSITIES: UniversitySeed[] = [
  ...PUBLIC_UNIVERSITIES,
  AZHAR,
  ...PRIVATE_UNIVERSITIES,
  ...AHLIYA_UNIVERSITIES,
  ...TECHNOLOGICAL_UNIVERSITIES,
  ...INTERNATIONAL_UNIVERSITIES,
];

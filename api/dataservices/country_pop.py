import mysql.connector
from mysql.connector import pooling
import os
from dotenv import load_dotenv
import logging
import sys
from datetime import datetime
import re

class CountryLanguageProcessor:
    def __init__(self):
        self.db_pool = None
        self.unmapped_countries = set()
        self.unmapped_languages = set()
        self.setup_logging()
        self.setup_database()
        
    def setup_logging(self):
        """Setup logging"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    def setup_database(self):
        """Setup MySQL database connection pool"""
        try:
            load_dotenv()
            
            DB_CONFIG = {
                "host": os.getenv("DB_HOST", "localhost"),
                "user": os.getenv("DB_USER", "root"),
                "password": os.getenv("DB_PASS", ""),
                "database": os.getenv("DB_NAME", "cplodb"),
                "port": int(os.getenv("DB_PORT", "3306")),
                "charset": 'utf8mb4',
                "use_unicode": True,
                "pool_name": "cplodb_pool",
                "pool_size": 5,
                "pool_reset_session": True
            }
            
            # Create connection pool
            self.db_pool = mysql.connector.pooling.MySQLConnectionPool(**DB_CONFIG)
            self.logger.info(f"✓ Connected to database: {DB_CONFIG['database']}")
            
        except Exception as e:
            self.logger.error(f"✗ Database connection failed: {e}")
            self.logger.error("Please check your .env file or database credentials")
            self.db_pool = None
    
    def normalize_country_name(self, country_name):
        """Normalize country names for consistency"""
        if not country_name:
            return ""
            
        country_name = str(country_name).strip()
        
        # Common country mappings
        country_mapping = {
            # United States variations
            'united states': 'United States',
            'usa': 'United States',
            'us': 'United States',
            'u.s.': 'United States',
            'u.s.a.': 'United States',
            'america': 'United States',
            'united states of america': 'United States',
            
            # United Kingdom variations
            'united kingdom': 'United Kingdom',
            'uk': 'United Kingdom',
            'u.k.': 'United Kingdom',
            'great britain': 'United Kingdom',
            'britain': 'United Kingdom',
            'england': 'United Kingdom',
            
            # Other common variations
            'deutschland': 'Germany',
            'espana': 'Spain',
            'españa': 'Spain',
            'italia': 'Italy',
            'nederland': 'Netherlands',
            'france': 'France',
            'australia': 'Australia',
            'canada': 'Canada',
            'india': 'India',
            'china': 'China',
            'japan': 'Japan',
            'brazil': 'Brazil',
            'brasil': 'Brazil',
            'mexico': 'Mexico',
            'méxico': 'Mexico',
            'russia': 'Russia',
            'south africa': 'South Africa',
            'new zealand': 'New Zealand',
            'singapore': 'Singapore',
            'malaysia': 'Malaysia',
            'indonesia': 'Indonesia',
            'thailand': 'Thailand',
            'vietnam': 'Vietnam',
            'philippines': 'Philippines',
            'uae': 'United Arab Emirates',
            'united arab emirates': 'United Arab Emirates',
            'saudi arabia': 'Saudi Arabia',
            'korea': 'South Korea',
            'south korea': 'South Korea',
            'taiwan': 'Taiwan',
            'hong kong': 'Hong Kong',
            
            # NEW MAPPINGS from your output
            'cambodia': 'Cambodia',
            'costa rica': 'Costa Rica',
            'dominican republic': 'Dominican Republic',
            'guatemala': 'Guatemala',
            'guernsey': 'Guernsey',
            'niue': 'Niue',
            'paraguay': 'Paraguay',
            'puerto rico': 'Puerto Rico',
            'réunion': 'Réunion',
            'reunion': 'Réunion',
            'uruguay': 'Uruguay',
            'european union': 'European Union',
            'soviet union': 'Russia',
            'ussr': 'Russia',
        }
        
        lower_name = country_name.lower()
        
        # Check for exact match in mapping
        if lower_name in country_mapping:
            return country_mapping[lower_name]
        
        # Check for partial matches
        for key, value in country_mapping.items():
            if key in lower_name or lower_name in key:
                return value
        
        # Capitalize properly
        if ' ' in country_name:
            # Capitalize each word, except small words
            words = country_name.split()
            capitalized_words = []
            for word in words:
                if word.lower() in ['and', 'of', 'the', 'de', 'la', 'el']:
                    capitalized_words.append(word.lower())
                else:
                    capitalized_words.append(word.capitalize())
            return ' '.join(capitalized_words)
        else:
            return country_name.capitalize()
    
    def get_country_code(self, country_name):
        """Get country code from country name"""
        if not country_name:
            return 'XX'
            
        # Comprehensive country code mapping
        country_code_mapping = {
            'united states': 'US',
            'usa': 'US',
            'us': 'US',
            'america': 'US',
            'united kingdom': 'GB',
            'uk': 'GB',
            'great britain': 'GB',
            'britain': 'GB',
            'england': 'GB',
            'germany': 'DE',
            'france': 'FR',
            'italy': 'IT',
            'spain': 'ES',
            'netherlands': 'NL',
            'belgium': 'BE',
            'switzerland': 'CH',
            'austria': 'AT',
            'australia': 'AU',
            'canada': 'CA',
            'india': 'IN',
            'china': 'CN',
            'japan': 'JP',
            'brazil': 'BR',
            'mexico': 'MX',
            'argentina': 'AR',
            'chile': 'CL',
            'colombia': 'CO',
            'peru': 'PE',
            'venezuela': 'VE',
            'portugal': 'PT',
            'poland': 'PL',
            'sweden': 'SE',
            'norway': 'NO',
            'denmark': 'DK',
            'finland': 'FI',
            'ireland': 'IE',
            'greece': 'GR',
            'turkey': 'TR',
            'russia': 'RU',
            'ukraine': 'UA',
            'south africa': 'ZA',
            'new zealand': 'NZ',
            'singapore': 'SG',
            'malaysia': 'MY',
            'thailand': 'TH',
            'vietnam': 'VN',
            'philippines': 'PH',
            'indonesia': 'ID',
            'egypt': 'EG',
            'israel': 'IL',
            'saudi arabia': 'SA',
            'united arab emirates': 'AE',
            'qatar': 'QA',
            'kuwait': 'KW',
            'bangladesh': 'BD',
            'pakistan': 'PK',
            'sri lanka': 'LK',
            'nepal': 'NP',
            'south korea': 'KR',
            'north korea': 'KP',
            'taiwan': 'TW',
            'hong kong': 'HK',
            'macau': 'MO',
            'czech republic': 'CZ',
            'czechia': 'CZ',
            'slovakia': 'SK',
            'hungary': 'HU',
            'romania': 'RO',
            'bulgaria': 'BG',
            'croatia': 'HR',
            'serbia': 'RS',
            'slovenia': 'SI',
            'bosnia': 'BA',
            'lithuania': 'LT',
            'latvia': 'LV',
            'estonia': 'EE',
            'iceland': 'IS',
            'luxembourg': 'LU',
            'monaco': 'MC',
            'cyprus': 'CY',
            'malta': 'MT',
            'albania': 'AL',
            'macedonia': 'MK',
            'moldova': 'MD',
            'belarus': 'BY',
            'georgia': 'GE',
            'armenia': 'AM',
            'azerbaijan': 'AZ',
            'kazakhstan': 'KZ',
            'uzbekistan': 'UZ',
            'turkmenistan': 'TM',
            'kyrgyzstan': 'KG',
            'tajikistan': 'TJ',
            'mongolia': 'MN',
            'afghanistan': 'AF',
            'iran': 'IR',
            'iraq': 'IQ',
            'syria': 'SY',
            'jordan': 'JO',
            'lebanon': 'LB',
            'oman': 'OM',
            'bahrain': 'BH',
            'yemen': 'YE',
            'morocco': 'MA',
            'algeria': 'DZ',
            'tunisia': 'TN',
            'libya': 'LY',
            'sudan': 'SD',
            'ethiopia': 'ET',
            'kenya': 'KE',
            'nigeria': 'NG',
            'ghana': 'GH',
            'uganda': 'UG',
            'tanzania': 'TZ',
            'zambia': 'ZM',
            'zimbabwe': 'ZW',
            'mozambique': 'MZ',
            'angola': 'AO',
            'cameroon': 'CM',
            'senegal': 'SN',
            'mali': 'ML',
            'burkina faso': 'BF',
            'niger': 'NE',
            'chad': 'TD',
            'somalia': 'SO',
            'madagascar': 'MG',
            'mauritius': 'MU',
            'seychelles': 'SC',
            'rwanda': 'RW',
            'burundi': 'BI',
            'congo': 'CG',
            'dr congo': 'CD',
            'gabon': 'GA',
            'botswana': 'BW',
            'namibia': 'NA',
            'lesotho': 'LS',
            'eswatini': 'SZ',
            'liberia': 'LR',
            'sierra leone': 'SL',
            'guinea': 'GN',
            'benin': 'BJ',
            'togo': 'TG',
            'côte d\'ivoire': 'CI',
            'ivory coast': 'CI',
            'cape verde': 'CV',
            
            # NEW MAPPINGS from your output
            'cambodia': 'KH',
            'costa rica': 'CR',
            'dominican republic': 'DO',
            'guatemala': 'GT',
            'guernsey': 'GG',
            'niue': 'NU',
            'paraguay': 'PY',
            'puerto rico': 'PR',
            'réunion': 'RE',
            'reunion': 'RE',
            'uruguay': 'UY',
            'european union': 'EU',
            'soviet union': 'RU',
            'ussr': 'RU',
        }
        
        normalized_name = self.normalize_country_name(country_name).lower()
        
        # Direct match
        if normalized_name in country_code_mapping:
            return country_code_mapping[normalized_name]
        
        # Try to find partial match
        for key, value in country_code_mapping.items():
            if key in normalized_name or normalized_name in key:
                return value
        
        # Check if it's already a 2-letter code
        if len(normalized_name) == 2 and normalized_name.isalpha():
            return normalized_name.upper()
        
        # Mark as unmapped and return 'XX'
        self.unmapped_countries.add((country_name, normalized_name))
        return 'XX'
    
    def get_language_code(self, country_name, language_name):
        """Get language code based on country and language name"""
        if not language_name:
            # Default language based on country
            country_code = self.get_country_code(country_name)
            default_languages = {
                'US': ('en', 'English'),
                'GB': ('en', 'English'),
                'DE': ('de', 'German'),
                'FR': ('fr', 'French'),
                'IT': ('it', 'Italian'),
                'ES': ('es', 'Spanish'),
                'NL': ('nl', 'Dutch'),
                'BE': ('nl', 'Dutch'),
                'CH': ('de', 'German'),
                'AT': ('de', 'German'),
                'AU': ('en', 'English'),
                'CA': ('en', 'English'),
                'IN': ('en', 'English'),
                'CN': ('zh', 'Chinese'),
                'JP': ('ja', 'Japanese'),
                'KR': ('ko', 'Korean'),
                'BR': ('pt', 'Portuguese'),
                'MX': ('es', 'Spanish'),
                'AR': ('es', 'Spanish'),
                'CL': ('es', 'Spanish'),
                'CO': ('es', 'Spanish'),
                'PE': ('es', 'Spanish'),
                'PT': ('pt', 'Portuguese'),
                'PL': ('pl', 'Polish'),
                'SE': ('sv', 'Swedish'),
                'NO': ('no', 'Norwegian'),
                'DK': ('da', 'Danish'),
                'FI': ('fi', 'Finnish'),
                'IE': ('en', 'English'),
                'GR': ('el', 'Greek'),
                'TR': ('tr', 'Turkish'),
                'RU': ('ru', 'Russian'),
                'UA': ('uk', 'Ukrainian'),
                'SA': ('ar', 'Arabic'),
                'AE': ('ar', 'Arabic'),
                'EG': ('ar', 'Arabic'),
                'IL': ('he', 'Hebrew'),
                'ZA': ('en', 'English'),
                'NZ': ('en', 'English'),
                'SG': ('en', 'English'),
                'MY': ('ms', 'Malay'),
                'TH': ('th', 'Thai'),
                'VN': ('vi', 'Vietnamese'),
                'PH': ('en', 'English'),
                'ID': ('id', 'Indonesian'),
                'PK': ('ur', 'Urdu'),
                'BD': ('bn', 'Bengali'),
                'LK': ('si', 'Sinhala'),
                'NP': ('ne', 'Nepali'),
                'TW': ('zh-TW', 'Chinese (Taiwan)'),
                'HK': ('zh-HK', 'Chinese (Hong Kong)'),
                
                # NEW COUNTRY LANGUAGE DEFAULTS
                'KH': ('km', 'Khmer'),  # Cambodia
                'CR': ('es', 'Spanish'),  # Costa Rica
                'DO': ('es', 'Spanish'),  # Dominican Republic
                'GT': ('es', 'Spanish'),  # Guatemala
                'GG': ('en', 'English'),  # Guernsey
                'NU': ('en', 'English'),  # Niue
                'PY': ('es', 'Spanish'),  # Paraguay
                'PR': ('es', 'Spanish'),  # Puerto Rico
                'RE': ('fr', 'French'),  # Réunion
                'UY': ('es', 'Spanish'),  # Uruguay
                'EU': ('en', 'English'),  # European Union
            }
            return default_languages.get(country_code, ('en', 'English'))
        
        language_name = str(language_name).strip().lower()
        
        # Comprehensive language mapping
        language_mapping = {
            'en': ('en', 'English'),
            'english': ('en', 'English'),
            'de': ('de', 'German'),
            'german': ('de', 'German'),
            'fr': ('fr', 'French'),
            'french': ('fr', 'French'),
            'es': ('es', 'Spanish'),
            'spanish': ('es', 'Spanish'),
            'it': ('it', 'Italian'),
            'italian': ('it', 'Italian'),
            'nl': ('nl', 'Dutch'),
            'dutch': ('nl', 'Dutch'),
            'pt': ('pt', 'Portuguese'),
            'portuguese': ('pt', 'Portuguese'),
            'pl': ('pl', 'Polish'),
            'polish': ('pl', 'Polish'),
            'sv': ('sv', 'Swedish'),
            'swedish': ('sv', 'Swedish'),
            'no': ('no', 'Norwegian'),
            'norwegian': ('no', 'Norwegian'),
            'da': ('da', 'Danish'),
            'danish': ('da', 'Danish'),
            'fi': ('fi', 'Finnish'),
            'finnish': ('fi', 'Finnish'),
            'el': ('el', 'Greek'),
            'greek': ('el', 'Greek'),
            'tr': ('tr', 'Turkish'),
            'turkish': ('tr', 'Turkish'),
            'ru': ('ru', 'Russian'),
            'russian': ('ru', 'Russian'),
            'uk': ('uk', 'Ukrainian'),
            'ukrainian': ('uk', 'Ukrainian'),
            'zh': ('zh', 'Chinese'),
            'chinese': ('zh', 'Chinese'),
            'ja': ('ja', 'Japanese'),
            'japanese': ('ja', 'Japanese'),
            'ko': ('ko', 'Korean'),
            'korean': ('ko', 'Korean'),
            'ar': ('ar', 'Arabic'),
            'arabic': ('ar', 'Arabic'),
            'he': ('he', 'Hebrew'),
            'hebrew': ('he', 'Hebrew'),
            'hi': ('hi', 'Hindi'),
            'hindi': ('hi', 'Hindi'),
            'bn': ('bn', 'Bengali'),
            'bengali': ('bn', 'Bengali'),
            'ur': ('ur', 'Urdu'),
            'urdu': ('ur', 'Urdu'),
            'fa': ('fa', 'Persian'),
            'persian': ('fa', 'Persian'),
            'th': ('th', 'Thai'),
            'thai': ('th', 'Thai'),
            'vi': ('vi', 'Vietnamese'),
            'vietnamese': ('vi', 'Vietnamese'),
            'id': ('id', 'Indonesian'),
            'indonesian': ('id', 'Indonesian'),
            'ms': ('ms', 'Malay'),
            'malay': ('ms', 'Malay'),
            'tl': ('tl', 'Tagalog'),
            'tagalog': ('tl', 'Tagalog'),
            'cs': ('cs', 'Czech'),
            'czech': ('cs', 'Czech'),
            'sk': ('sk', 'Slovak'),
            'slovak': ('sk', 'Slovak'),
            'hu': ('hu', 'Hungarian'),
            'hungarian': ('hu', 'Hungarian'),
            'ro': ('ro', 'Romanian'),
            'romanian': ('ro', 'Romanian'),
            'bg': ('bg', 'Bulgarian'),
            'bulgarian': ('bg', 'Bulgarian'),
            'hr': ('hr', 'Croatian'),
            'croatian': ('hr', 'Croatian'),
            'sr': ('sr', 'Serbian'),
            'serbian': ('sr', 'Serbian'),
            'sl': ('sl', 'Slovenian'),
            'slovenian': ('sl', 'Slovenian'),
            'lt': ('lt', 'Lithuanian'),
            'lithuanian': ('lt', 'Lithuanian'),
            'lv': ('lv', 'Latvian'),
            'latvian': ('lv', 'Latvian'),
            'et': ('et', 'Estonian'),
            'estonian': ('et', 'Estonian'),
            'is': ('is', 'Icelandic'),
            'icelandic': ('is', 'Icelandic'),
            
            # NEW LANGUAGE MAPPINGS from your output
            'ar-latn': ('ar', 'Arabic (Latin)'),
            'bg-latn': ('bg', 'Bulgarian (Latin)'),
            'bn-latn': ('bn', 'Bengali (Latin)'),
            'el-latn': ('el', 'Greek (Latin)'),
            'gu-latn': ('gu', 'Gujarati (Latin)'),
            'hi-latn': ('hi', 'Hindi (Latin)'),
            'ja-latn': ('ja', 'Japanese (Latin)'),
            'kn-latn': ('kn', 'Kannada (Latin)'),
            'ml-latn': ('ml', 'Malayalam (Latin)'),
            'mr-latn': ('mr', 'Marathi (Latin)'),
            'ru-latn': ('ru', 'Russian (Latin)'),
            'ta-latn': ('ta', 'Tamil (Latin)'),
            'te-latn': ('te', 'Telugu (Latin)'),
            'uk-latn': ('uk', 'Ukrainian (Latin)'),
            'zh-latn': ('zh', 'Chinese (Latin)'),
            'zh-tw': ('zh-TW', 'Chinese (Taiwan)'),
            'pt-pt': ('pt-PT', 'Portuguese (Portugal)'),
            'yue': ('yue', 'Cantonese'),
            'unknown': ('en', 'English'),
            'bem': ('bem', 'Bemba'),
            'bik': ('bik', 'Bikol'),
            'ceb': ('ceb', 'Cebuano'),
            'crs': ('crs', 'Seychellois Creole'),
            'din': ('din', 'Dinka'),
            'fil': ('fil', 'Filipino'),
            'fur': ('fur', 'Friulian'),
            'haw': ('haw', 'Hawaiian'),
            'hmn': ('hmn', 'Hmong'),
            'ilo': ('ilo', 'Ilocano'),
            'kha': ('kha', 'Khasi'),
            'kri': ('kri', 'Krio'),
            'lij': ('lij', 'Ligurian'),
            'lmo': ('lmo', 'Lombard'),
            'lua': ('lua', 'Luba-Lulua'),
            'luo': ('luo', 'Luo'),
            'lus': ('lus', 'Mizo'),
            'mad': ('mad', 'Madurese'),
            'mam': ('mam', 'Mam'),
            'nso': ('nso', 'Northern Sotho'),
            'pag': ('pag', 'Pangasinan'),
            'pam': ('pam', 'Pampanga'),
            'tet': ('tet', 'Tetum'),
            'tpi': ('tpi', 'Tok Pisin'),
            'udm': ('udm', 'Udmurt'),
            'war': ('war', 'Waray'),
        }
        
        if language_name in language_mapping:
            return language_mapping[language_name]
        
        # Try 2-letter code
        if len(language_name) == 2:
            return (language_name, language_name.upper())
        
        # Handle language codes with hyphens
        if '-' in language_name:
            base_lang = language_name.split('-')[0]
            if base_lang in language_mapping:
                base_code, base_name = language_mapping[base_lang]
                return (language_name, f"{base_name} ({language_name.upper()})")
        
        self.unmapped_languages.add(language_name)
        return ('en', 'English')
    
    def parse_primary_locations(self, primary_location):
        """Parse primary_location field which may contain multiple countries"""
        if not primary_location:
            return []
        
        primary_location = str(primary_location)
        
        # Skip if it's clearly not specific countries
        primary_location_lower = primary_location.lower()
        skip_keywords = ['multi country', 'all countries', 'global', 'worldwide', 
                        'international', 'world', 'all', 'multiple', 'various']
        
        if any(keyword in primary_location_lower for keyword in skip_keywords):
            return []
        
        # Initialize countries list
        countries = []
        
        # Split by common delimiters
        delimiters = [',', ';', '/', ' and ', ' & ', '|']
        
        # Start with the full string
        parts = [primary_location]
        
        # Split by each delimiter
        for delimiter in delimiters:
            new_parts = []
            for part in parts:
                if delimiter in part:
                    new_parts.extend([p.strip() for p in part.split(delimiter) if p.strip()])
                else:
                    new_parts.append(part.strip())
            parts = new_parts
        
        # Process each part
        for part in parts:
            if not part or part == '':
                continue
                
            # Clean up the part
            part = part.strip()
            
            # Remove common prefixes/suffixes
            part = re.sub(r'^countries?\s*[:=]?\s*', '', part, flags=re.IGNORECASE)
            part = re.sub(r'\s*\(.*?\)', '', part)  # Remove parentheses content
            part = re.sub(r'\[.*?\]', '', part)     # Remove bracket content
            
            # Normalize
            normalized = self.normalize_country_name(part)
            if normalized and normalized not in countries:
                countries.append(normalized)
        
        return countries
    
    def process_coupons(self):
        """Process coupons table and populate country_language table"""
        if not self.db_pool:
            self.logger.error("Database connection not available")
            return
        
        connection = self.db_pool.get_connection()
        cursor = connection.cursor(dictionary=True)
        
        try:
            # First, let's check the total count of coupons
            cursor.execute("SELECT COUNT(*) as total FROM coupons")
            total_coupons = cursor.fetchone()['total']
            self.logger.info(f"Total coupons in database: {total_coupons:,}")
            
            # Get ALL coupons with primary_location (including empty/null)
            cursor.execute("""
                SELECT primary_location, language 
                FROM coupons 
                WHERE primary_location IS NOT NULL 
                AND primary_location != ''
                ORDER BY id
            """)
            
            coupons = cursor.fetchall()
            self.logger.info(f"Found {len(coupons):,} coupons with non-empty primary_location")
            
            if len(coupons) < total_coupons:
                self.logger.warning(f"Only {len(coupons):,} of {total_coupons:,} coupons have non-empty primary_location")
            
            # Process each coupon
            country_data = {}
            processed_count = 0
            
            for i, coupon in enumerate(coupons):
                primary_location = coupon['primary_location']
                language = coupon['language']
                
                # Parse countries from primary_location
                countries = self.parse_primary_locations(primary_location)
                
                for country_name in countries:
                    if not country_name:
                        continue
                    
                    # Get country code
                    country_code = self.get_country_code(country_name)
                    
                    # Get language code and name
                    language_code, language_name = self.get_language_code(country_name, language)
                    
                    # Store or update country data
                    key = country_name.lower()
                    if key not in country_data:
                        country_data[key] = {
                            'country_name': country_name,
                            'country_code': country_code,
                            'language_code': language_code,
                            'language_name': language_name,
                            'count': 1
                        }
                    else:
                        country_data[key]['count'] += 1
                
                processed_count += 1
                
                # Log progress
                if processed_count % 10000 == 0:
                    self.logger.info(f"Processed {processed_count:,}/{len(coupons):,} coupons...")
            
            self.logger.info(f"Processing completed. Found {len(country_data)} unique countries")
            
            # Now handle database operations
            # First, check the current state of the table
            cursor.execute("SELECT COUNT(*) as count FROM country_language")
            existing_count = cursor.fetchone()['count']
            self.logger.info(f"Currently {existing_count} records in country_language table")
            
            # Process each country
            stats = {
                'inserted': 0,
                'updated': 0,
                'skipped': 0,
                'errors': 0
            }
            
            # First, let's see what's already in the table
            cursor.execute("SELECT country_code, language_code FROM country_language")
            existing_combinations = set()
            for row in cursor.fetchall():
                existing_combinations.add(f"{row['country_code']}-{row['language_code']}")
            
            self.logger.info(f"Found {len(existing_combinations)} existing country-language combinations")
            
            # Process each country
            for country_key, data in country_data.items():
                country_name = data['country_name']
                country_code = data['country_code']
                language_code = data['language_code']
                language_name = data['language_name']
                count = data['count']
                
                # Check if this combination already exists
                combination_key = f"{country_code}-{language_code}"
                
                if combination_key in existing_combinations:
                    # Check if we need to update the country name
                    cursor.execute("""
                        SELECT id, country_name 
                        FROM country_language 
                        WHERE country_code = %s AND language_code = %s
                        LIMIT 1
                    """, (country_code, language_code))
                    
                    existing = cursor.fetchone()
                    if existing:
                        # Update if country name is different
                        if existing['country_name'] != country_name:
                            try:
                                update_cursor = connection.cursor()
                                update_cursor.execute("""
                                    UPDATE country_language 
                                    SET country_name = %s, updated_at = NOW()
                                    WHERE id = %s
                                """, (country_name, existing['id']))
                                connection.commit()
                                stats['updated'] += 1
                                self.logger.debug(f"Updated name: {country_name} ({country_code})")
                            except Exception as e:
                                stats['errors'] += 1
                                self.logger.error(f"Error updating {country_name}: {e}")
                        else:
                            stats['skipped'] += 1
                else:
                    # Try to insert new record
                    try:
                        insert_cursor = connection.cursor()
                        insert_cursor.execute("""
                            INSERT INTO country_language 
                            (country_code, country_name, language_code, language_name, 
                             is_default, is_seo_enabled, is_ui_enabled, priority, enabled)
                            VALUES (%s, %s, %s, %s, 0, 0, 1, 100, 1)
                        """, (country_code, country_name, language_code, language_name))
                        connection.commit()
                        stats['inserted'] += 1
                        existing_combinations.add(combination_key)  # Add to set for future checks
                        self.logger.info(f"Inserted: {country_name} ({country_code}) - {language_name} ({language_code}) [Found in {count} coupons]")
                    except mysql.connector.Error as e:
                        if e.errno == 1062:  # Duplicate entry
                            stats['skipped'] += 1
                            self.logger.debug(f"Duplicate prevented: {country_name} ({country_code})")
                        else:
                            stats['errors'] += 1
                            self.logger.error(f"Error inserting {country_name}: {e}")
                    except Exception as e:
                        stats['errors'] += 1
                        self.logger.error(f"Error inserting {country_name}: {e}")
            
            # Print summary
            self.logger.info(f"\n{'='*60}")
            self.logger.info("PROCESSING SUMMARY")
            self.logger.info(f"{'='*60}")
            self.logger.info(f"Total coupons processed: {len(coupons):,}")
            self.logger.info(f"Unique countries found: {len(country_data)}")
            self.logger.info(f"Successfully inserted: {stats['inserted']}")
            self.logger.info(f"Successfully updated: {stats['updated']}")
            self.logger.info(f"Skipped (duplicate/no change): {stats['skipped']}")
            self.logger.info(f"Errors: {stats['errors']}")
            
            # Show top 20 countries by coupon count
            if country_data:
                self.logger.info(f"\nTop 20 countries by occurrence:")
                sorted_countries = sorted(country_data.items(), key=lambda x: x[1]['count'], reverse=True)[:20]
                for i, (key, data) in enumerate(sorted_countries, 1):
                    self.logger.info(f"  {i:2}. {data['country_name']:<25} ({data['country_code']}): {data['count']:>5} coupons")
            
        except Exception as e:
            self.logger.error(f"Error processing coupons: {e}")
            import traceback
            traceback.print_exc()
        finally:
            cursor.close()
            connection.close()
    
    def show_unmapped_items(self):
        """Show all unmapped countries and languages"""
        if self.unmapped_countries:
            self.logger.warning(f"\n{'='*80}")
            self.logger.warning("UNMAPPED COUNTRIES FOUND:")
            self.logger.warning(f"{'='*80}")
            self.logger.warning(f"{'Original':<30} {'Normalized':<30}")
            self.logger.warning(f"{'-'*30} {'-'*30}")
            for original, normalized in sorted(self.unmapped_countries):
                self.logger.warning(f"{original:<30} {normalized:<30}")
            self.logger.warning(f"\nTotal unmapped countries: {len(self.unmapped_countries)}")
        
        if self.unmapped_languages:
            self.logger.warning(f"\n{'='*80}")
            self.logger.warning("UNMAPPED LANGUAGES FOUND:")
            self.logger.warning(f"{'='*80}")
            self.logger.warning(f"{'Language Code':<20}")
            self.logger.warning(f"{'-'*20}")
            for lang in sorted(self.unmapped_languages):
                self.logger.warning(f"{lang:<20}")
            self.logger.warning(f"\nTotal unmapped languages: {len(self.unmapped_languages)}")
        
        if not self.unmapped_countries and not self.unmapped_languages:
            self.logger.info(f"\n{'='*80}")
            self.logger.info("ALL ITEMS SUCCESSFULLY MAPPED!")
            self.logger.info(f"{'='*80}")
    
    def generate_mapping_suggestions(self):
        """Generate code suggestions for unmapped items"""
        if self.unmapped_countries or self.unmapped_languages:
            self.logger.info(f"\n{'='*80}")
            self.logger.info("SUGGESTED MAPPINGS TO ADD TO YOUR CODE:")
            self.logger.info(f"{'='*80}")
            
            if self.unmapped_countries:
                self.logger.info("\nAdd to country_mapping in normalize_country_name():")
                for original, normalized in sorted(self.unmapped_countries):
                    self.logger.info(f"    '{normalized.lower()}': '{normalized}',")
                
                self.logger.info("\nAdd to country_code_mapping in get_country_code():")
                for original, normalized in sorted(self.unmapped_countries):
                    # Generate suggested country code
                    if len(normalized) >= 2:
                        suggested_code = normalized[:2].upper()
                    else:
                        suggested_code = 'XX'
                    self.logger.info(f"    '{normalized.lower()}': '{suggested_code}',")
            
            if self.unmapped_languages:
                self.logger.info("\nAdd to language_mapping in get_language_code():")
                for lang in sorted(self.unmapped_languages):
                    # Generate suggested language name
                    if '-' in lang:
                        base = lang.split('-')[0]
                        suggestion = f"{base.upper()} ({lang})"
                    elif len(lang) == 2:
                        suggestion = lang.upper()
                    else:
                        suggestion = lang.title()
                    self.logger.info(f"    '{lang}': ('{lang}', '{suggestion}'),")
            
            self.logger.info(f"\n{'='*80}")

def main():
    """Main function"""
    processor = CountryLanguageProcessor()
    
    if not processor.db_pool:
        processor.logger.error("Failed to connect to database. Exiting.")
        return
    
    try:
        # Process coupons and populate country_language table
        processor.process_coupons()
        
        # Show unmapped items
        processor.show_unmapped_items()
        
        # Generate mapping suggestions
        processor.generate_mapping_suggestions()
        
        processor.logger.info("\nProcessing completed successfully!")
        
    except KeyboardInterrupt:
        processor.logger.info("\nProcess interrupted by user")
        processor.show_unmapped_items()
        processor.generate_mapping_suggestions()
    except Exception as e:
        processor.logger.error(f"\nUnexpected error: {e}")
        processor.show_unmapped_items()
        processor.generate_mapping_suggestions()
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
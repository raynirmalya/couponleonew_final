#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
fetch_and_store_logos.py
- Fetches logos from BrandLogos.org API only for matching domain-brand combinations
- Stores logos in Cloudflare R2 bucket
- Updates MySQL database with R2 public paths only in existing rows
- Fixed database connection pool exhaustion issues
"""

import os
import sys
import hashlib
import json
import time
import requests
import imghdr
from datetime import datetime
from dotenv import load_dotenv
from mysql.connector import pooling, Error
import boto3
from botocore.config import Config

# -------------------- ENV --------------------
load_dotenv()

# BrandLogos.org API Configuration
API_KEY = os.getenv("BRANDLOGOS_API_KEY")
DOMAIN = os.getenv("BRANDLOGOS_DOMAIN")  # Your registered website domain

# R2 Configuration
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET", "brand-logos")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_BASE")  # e.g., https://pub.r2.dev

# MySQL Configuration
DB_CFG = dict(
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER", "root"),
    password=os.getenv("DB_PASS", ""),
    database=os.getenv("DB_NAME", "doc_tutorizer"),
    use_pure=True,
    connection_timeout=10,
)

# New column names for logo URLs
HORIZONTAL_LOGO_COLUMN = "logo_horizontal_url"
SQUARE_LOGO_COLUMN = "logo_square_url"

# Initialize MySQL Connection Pool with increased size
POOL = pooling.MySQLConnectionPool(
    pool_name="logos_pool",
    pool_size=20,  # Increased from 5 to handle large batches
    pool_reset_session=True,
    autocommit=True,
    **DB_CFG
)

def get_conn():
    """Get database connection from pool with retry logic"""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            return POOL.get_connection()
        except pooling.PoolError as e:
            if attempt < max_retries - 1:
                wait_time = 1 * (attempt + 1)  # Exponential backoff: 1s, 2s, 3s
                print(f"Connection pool busy, retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            raise

def initialize_r2_client():
    """Initialize R2 S3 client"""
    return boto3.client(
        's3',
        endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version='s3v4')
    )

def add_logo_columns():
    """Add new columns for horizontal and square logos if they don't exist"""
    conn = None
    cursor = None
    try:
        conn = get_conn()
        cursor = conn.cursor()
        
        # Check if horizontal logo column exists
        cursor.execute("""
            SELECT COUNT(*) 
            FROM information_schema.columns 
            WHERE table_name = 'stores' 
            AND column_name = %s
            AND table_schema = DATABASE()
        """, (HORIZONTAL_LOGO_COLUMN,))
        
        if cursor.fetchone()[0] == 0:
            print(f"Adding column: {HORIZONTAL_LOGO_COLUMN}")
            cursor.execute(f"""
                ALTER TABLE stores 
                ADD COLUMN {HORIZONTAL_LOGO_COLUMN} TEXT NULL
            """)
        
        # Check if square logo column exists
        cursor.execute("""
            SELECT COUNT(*) 
            FROM information_schema.columns 
            WHERE table_name = 'stores' 
            AND column_name = %s
            AND table_schema = DATABASE()
        """, (SQUARE_LOGO_COLUMN,))
        
        if cursor.fetchone()[0] == 0:
            print(f"Adding column: {SQUARE_LOGO_COLUMN}")
            cursor.execute(f"""
                ALTER TABLE stores 
                ADD COLUMN {SQUARE_LOGO_COLUMN} TEXT NULL
            """)
        
        conn.commit()
        print("Logo columns added/verified successfully")
        return True
        
    except Exception as e:
        print(f"Error adding logo columns: {str(e)}")
        return False
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def generate_token(api_key, brand):
    """Generate SHA256 token for API authentication"""
    return hashlib.sha256(f"{api_key}{brand}".encode()).hexdigest()

def validate_image_content(image_data):
    """Validate that the response contains a proper image"""
    if not image_data:
        return False, "No image data received"
    
    # Check minimum size (PNG header is at least 8 bytes)
    if len(image_data) < 100:
        return False, f"Image too small ({len(image_data)} bytes)"
    
    # Try to identify image type
    try:
        image_type = imghdr.what(None, h=image_data)
        if image_type not in ['png', 'jpeg', 'jpg', 'webp', 'svg']:
            return False, f"Invalid image type: {image_type}"
        
        # Check for common image magic numbers
        if image_data[:8] == b'\x89PNG\r\n\x1a\n':
            return True, "PNG"
        elif image_data[:3] == b'\xff\xd8\xff':
            return True, "JPEG"
        elif image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
            return True, "WEBP"
        elif b'<svg' in image_data[:100].lower():
            return True, "SVG"
        else:
            return True, f"Valid image ({image_type})"
            
    except Exception as e:
        return False, f"Image validation error: {str(e)}"

def fetch_logo_from_api(brand, size='horizontal', format='png'):
    """Fetch logo from BrandLogos.org API with proper validation"""
    token = generate_token(API_KEY, brand)
    
    url = f"https://brandlogos.org/api/get/images/"
    params = {
        'brand': brand,
        'size': size,
        'format': format,
        'token': token,
        'domain': DOMAIN
    }
    
    try:
        print(f"  Fetching {size} logo for {brand}...")
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            
            # Check if response is JSON (error)
            if 'application/json' in content_type:
                try:
                    data = response.json()
                    print(f"    Received JSON response: {data}")
                    if 'result' in data and data['result'] == 'error':
                        error_msg = data.get('error_message', 'Unknown error')
                        print(f"    API Error: {error_msg}")
                        return None, error_msg
                    else:
                        return None, "Unexpected JSON response"
                except json.JSONDecodeError:
                    pass
            
            # Validate it's a proper image
            image_data = response.content
            is_valid, validation_msg = validate_image_content(image_data)
            
            if is_valid:
                print(f"    ✓ Valid {validation_msg} image received ({len(image_data)} bytes)")
                return image_data, None
            else:
                print(f"    ✗ Invalid image: {validation_msg}")
                return None, validation_msg
                
        elif response.status_code == 400:
            error_data = response.json() if 'application/json' in response.headers.get('content-type', '') else {}
            error_msg = error_data.get('error_message', 'Bad Request - Check domain registration')
            print(f"    ✗ Domain verification failed: {error_msg}")
            return None, f"Domain verification failed: {error_msg}"
            
        elif response.status_code == 403:
            print(f"    ✗ Access forbidden - Invalid API key or domain")
            return None, "Access forbidden - Check API key and domain"
            
        elif response.status_code == 404:
            print(f"    ✗ Logo not found for {brand}")
            return None, f"Logo not found for {brand}"
            
        else:
            print(f"    ✗ HTTP Error {response.status_code}")
            return None, f"HTTP Error {response.status_code}"
            
    except requests.exceptions.Timeout:
        error_msg = "Request timeout"
        print(f"    ✗ {error_msg}")
        return None, error_msg
    except requests.exceptions.ConnectionError:
        error_msg = "Connection error"
        print(f"    ✗ {error_msg}")
        return None, error_msg
    except Exception as e:
        error_msg = str(e)
        print(f"    ✗ Error: {error_msg}")
        return None, error_msg

def upload_to_r2(s3_client, image_data, brand, size, format='png'):
    """Upload logo to R2 bucket with validation"""
    # Clean brand name for filename
    clean_brand = brand.replace('https://', '').replace('http://', '').replace('/', '_').replace('.', '_')
    filename = f"{clean_brand}_{size}.{format}"
    key = f"logos/{filename}"
    
    try:
        # Validate image before upload
        is_valid, validation_msg = validate_image_content(image_data)
        if not is_valid:
            print(f"    ✗ Cannot upload invalid image: {validation_msg}")
            return None, validation_msg
        
        # Determine content type
        if format == 'svg':
            content_type = 'image/svg+xml'
        else:
            content_type = f'image/{format}'
        
        # Upload to R2
        print(f"    Uploading to R2...")
        s3_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=key,
            Body=image_data,
            ContentType=content_type,
            ACL='public-read'
        )
        
        # Return public URL
        public_url = f"{R2_PUBLIC_URL}/{key}"
        print(f"    ✓ Uploaded to: {public_url}")
        return public_url, None
        
    except Exception as e:
        error_msg = str(e)
        print(f"    ✗ R2 upload error: {error_msg}")
        return None, error_msg

def get_all_existing_stores(brands):
    """Get all existing stores in one query - optimized for large batches"""
    conn = None
    cursor = None
    try:
        conn = get_conn()
        cursor = conn.cursor(dictionary=True)
        
        # Use WHERE IN clause to get all stores at once
        placeholders = ', '.join(['%s'] * len(brands))
        query = f"""
            SELECT id, name, logo_horizontal_url, logo_square_url 
            FROM stores 
            WHERE name IN ({placeholders})
        """
        
        cursor.execute(query, brands)
        results = cursor.fetchall()
        
        # Convert to dictionary for O(1) lookup
        store_dict = {row['name']: row for row in results}
        return store_dict
        
    except Exception as e:
        print(f"Database error fetching stores: {str(e)}")
        return {}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def update_existing_store_logos(store_id, r2_url_horizontal, r2_url_square):
    """Update existing store with new logo URLs"""
    conn = None
    cursor = None
    try:
        conn = get_conn()
        cursor = conn.cursor()
        
        # Build update query based on which URLs we have
        updates = []
        params = []
        
        if r2_url_horizontal:
            updates.append(f"{HORIZONTAL_LOGO_COLUMN} = %s")
            params.append(r2_url_horizontal)
        
        if r2_url_square:
            updates.append(f"{SQUARE_LOGO_COLUMN} = %s")
            params.append(r2_url_square)
        
        if not updates:
            return False  # Nothing to update
        
        # Add store_id to params
        params.append(store_id)
        
        # Execute update
        update_sql = f"""
            UPDATE stores 
            SET {', '.join(updates)}
            WHERE id = %s
        """
        
        cursor.execute(update_sql, tuple(params))
        conn.commit()
        
        updated = cursor.rowcount > 0
        
        if updated:
            print(f"    ✓ Updated logo URLs for store ID {store_id}")
            if r2_url_horizontal:
                print(f"      Horizontal: {r2_url_horizontal}")
            if r2_url_square:
                print(f"      Square: {r2_url_square}")
        
        return updated
        
    except Exception as e:
        print(f"    ✗ Database update error: {str(e)}")
        return False
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def copy_existing_logo_paths():
    """Copy logo paths from primary_location to new logo columns if they exist"""
    conn = None
    cursor = None
    try:
        conn = get_conn()
        cursor = conn.cursor()
        
        # Find stores with primary_location but new logo columns are empty
        cursor.execute(f"""
            SELECT id, name, primary_location 
            FROM stores 
            WHERE primary_location IS NOT NULL 
            AND primary_location != ''
            AND ({HORIZONTAL_LOGO_COLUMN} IS NULL OR {HORIZONTAL_LOGO_COLUMN} = '')
            LIMIT 100
        """)
        
        stores_to_update = cursor.fetchall()
        
        updated_count = 0
        for store_id, store_name, primary_location in stores_to_update:
            if primary_location and primary_location.strip():
                # Check if the URL is valid
                if primary_location.startswith(('http://', 'https://')):
                    cursor.execute(f"""
                        UPDATE stores 
                        SET {HORIZONTAL_LOGO_COLUMN} = %s, 
                            {SQUARE_LOGO_COLUMN} = %s
                        WHERE id = %s
                    """, (
                        primary_location,
                        primary_location,
                        store_id
                    ))
                    updated_count += 1
                    print(f"Copied logo path for: {store_name}")
        
        conn.commit()
        print(f"Copied logo paths for {updated_count} stores")
        
    except Exception as e:
        print(f"Error copying logo paths: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def fetch_brands_to_process():
    """Fetch brands from database that don't have both logos yet"""
    conn = None
    cursor = None
    try:
        conn = get_conn()
        cursor = conn.cursor()
        
        # Fetch brands that are missing either horizontal or square logos
        # Only fetch brands that exist in our database
        cursor.execute(f"""
            SELECT DISTINCT name 
            FROM stores 
            WHERE ({HORIZONTAL_LOGO_COLUMN} IS NULL OR {HORIZONTAL_LOGO_COLUMN} = '' 
                   OR {SQUARE_LOGO_COLUMN} IS NULL OR {SQUARE_LOGO_COLUMN} = '')
            AND name IS NOT NULL 
            AND name != ''
            LIMIT 15000  # Limit to avoid too many API calls
        """)
        
        brands = [row[0] for row in cursor.fetchall()]
        
        print(f"Found {len(brands)} brands missing logos")
        return brands
        
    except Exception as e:
        print(f"Error fetching brands from database: {str(e)}")
        return []
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def process_brands(brands):
    """Main function to process all brands - optimized for large batches"""
    print(f"Processing {len(brands)} brands...")
    
    # Initialize R2 client
    s3_client = initialize_r2_client()
    
    # Get all stores in one query (optimization)
    print("Fetching store information...")
    all_stores = get_all_existing_stores(brands)
    
    successful = 0
    failed = 0
    skipped_no_store = 0
    
    for i, brand in enumerate(brands, 1):
        print(f"\n{'='*60}")
        print(f"[{i}/{len(brands)}] Processing: {brand}")
        
        # 1. Check if store exists in our pre-fetched data
        store = all_stores.get(brand)
        if not store:
            print(f"    ⏭️ No store found with name '{brand}' in database. Skipping.")
            skipped_no_store += 1
            continue
        
        store_id = store['id']
        print(f"    Found store ID: {store_id}")
        
        # 2. Check if already has both logos
        has_horizontal = store.get(HORIZONTAL_LOGO_COLUMN) and store[HORIZONTAL_LOGO_COLUMN].strip()
        has_square = store.get(SQUARE_LOGO_COLUMN) and store[SQUARE_LOGO_COLUMN].strip()
        
        if has_horizontal and has_square:
            print(f"    ⏭️ Store already has both logos. Skipping.")
            continue
        
        # 3. Determine which logos to fetch
        fetch_horizontal = not has_horizontal
        fetch_square = not has_square
        
        r2_url_horizontal = None
        r2_url_square = None
        fetched_any = False
        
        # 4. Fetch and upload horizontal logo if needed
        if fetch_horizontal:
            horizontal_logo, h_error = fetch_logo_from_api(brand, size='horizontal', format='png')
            if horizontal_logo:
                r2_url_horizontal, upload_error = upload_to_r2(
                    s3_client, horizontal_logo, brand, 'horizontal', 'png'
                )
                if r2_url_horizontal:
                    fetched_any = True
                else:
                    print(f"    ✗ Failed to upload horizontal logo: {upload_error}")
            else:
                print(f"    ✗ Failed to fetch horizontal logo: {h_error}")
        else:
            print(f"    Horizontal logo already exists")
        
        # 5. Fetch and upload square logo if needed
        if fetch_square:
            square_logo, s_error = fetch_logo_from_api(brand, size='square', format='png')
            if square_logo:
                r2_url_square, upload_error = upload_to_r2(
                    s3_client, square_logo, brand, 'square', 'png'
                )
                if r2_url_square:
                    fetched_any = True
                else:
                    print(f"    ✗ Failed to upload square logo: {upload_error}")
            else:
                print(f"    ✗ Failed to fetch square logo: {s_error}")
        else:
            print(f"    Square logo already exists")
        
        # 6. Update database only if we fetched new logos
        if fetched_any:
            if update_existing_store_logos(store_id, r2_url_horizontal, r2_url_square):
                successful += 1
                print(f"    ✅ Successfully updated logos for {brand}")
            else:
                failed += 1
                print(f"    ❌ Database update failed for {brand}")
        else:
            if not fetch_horizontal and not fetch_square:
                print(f"    ⏭️ No logos needed to be fetched for {brand}")
            else:
                failed += 1
                print(f"    ❌ Failed to fetch any new logos for {brand}")
        
        # 7. Delay to avoid rate limiting (adjust based on API limits)
        if i < len(brands):
            time.sleep(2)  # 2-second delay between brands
        
        # 8. Progress indicator every 100 brands
        if i % 100 == 0:
            print(f"\n{'='*60}")
            print(f"PROGRESS: Processed {i}/{len(brands)} brands")
            print(f"Success: {successful}, Failed: {failed}, Skipped: {skipped_no_store}")
            print(f"{'='*60}")
    
    print(f"\n{'='*60}")
    print(f"PROCESSING COMPLETE")
    print(f"{'='*60}")
    print(f"✅ Successful updates: {successful}")
    print(f"⏭️ Skipped (no store found): {skipped_no_store}")
    print(f"❌ Failed: {failed}")
    print(f"{'='*60}")
    
    return successful, failed, skipped_no_store

def main():
    """Main execution function"""
    print("="*60)
    print("LOGO FETCHING SYSTEM - Domain Restricted")
    print("="*60)
    print(f"Domain: {DOMAIN}")
    print(f"R2 Bucket: {R2_BUCKET_NAME}")
    print(f"R2 URL: {R2_PUBLIC_URL}")
    print("="*60)
    
    # Check required environment variables
    required_vars = ['BRANDLOGOS_API_KEY', 'BRANDLOGOS_DOMAIN', 
                    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 
                    'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE']
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        print(f"Error: Missing environment variables: {', '.join(missing_vars)}")
        sys.exit(1)
    
    # Step 1: Add logo columns if needed
    print("\n[STEP 1] Checking database columns...")
    if not add_logo_columns():
        print("Failed to add logo columns. Exiting.")
        sys.exit(1)
    
    # Step 2: Get brands to process from database
    print("\n[STEP 2] Loading brands from database...")
    brands = fetch_brands_to_process()
    
    if not brands:
        print("No brands need logos. Exiting.")
        sys.exit(0)
    
    print(f"Found {len(brands)} brands that need logos")
    
    # Step 3: Process brands (only updates existing rows)
    print("\n[STEP 3] Processing brands...")
    successful, failed, skipped = process_brands(brands)
    
    # Step 4: Copy existing paths (optional)
    print("\n[STEP 4] Copying existing logo paths...")
    copy_existing_logo_paths()
    
    # Summary
    print(f"\n{'='*60}")
    print("FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"Total brands checked: {len(brands)}")
    print(f"✅ Successfully updated: {successful}")
    print(f"⏭️ Skipped (no store): {skipped}")
    print(f"❌ Failed: {failed}")
    print(f"\nIMPORTANT NOTES:")
    print(f"1. Only updates existing store rows in database")
    print(f"2. Brand must match domain registration on BrandLogos.org")
    print(f"3. Validates image format before upload")
    print(f"4. Does NOT create new store entries")
    print(f"5. Optimized for large batches (15,000+ brands)")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
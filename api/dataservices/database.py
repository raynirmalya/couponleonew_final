# database.py
import pymysql
from pymysql.cursors import DictCursor
from config import Config
import traceback

def get_connection():
    """Get MySQL database connection"""
    return pymysql.connect(
        host=Config.MYSQL_HOST,
        port=int(Config.MYSQL_PORT), 
        user=Config.MYSQL_USER,
        password=Config.MYSQL_PASSWORD,
        database=Config.MYSQL_DB,
        cursorclass=DictCursor,
        charset='utf8mb4'
    )

def row_tuples_to_dicts(cursor, rows):
    """Convert rows to dictionary format"""
    if not rows:
        return []
    
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in rows]

def safe_close(cursor, conn):
    """Safely close cursor and connection"""
    try:
        if cursor:
            cursor.close()
    except:
        pass
    try:
        if conn:
            conn.close()
    except:
        pass
# id_codec.py
ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
BASE = len(ALPHABET)

SECRET_XOR = 0xA5F3F5A2A1F1
SALT_ADD  = 0x9F22C8D4A7B1
MIN_LEN = 32


def base62_encode(num: int) -> str:
    if num == 0:
        return ALPHABET[0]
    result = []
    while num > 0:
        num, rem = divmod(num, BASE)
        result.append(ALPHABET[rem])
    return ''.join(reversed(result))


def base62_decode(s: str) -> int:
    n = 0
    for char in s:
        n = n * BASE + ALPHABET.index(char)
    return n


def encode_id(num_id: int) -> str:
    mixed = (num_id ^ SECRET_XOR) + SALT_ADD
    b62 = base62_encode(mixed)
    return b62.rjust(MIN_LEN, ALPHABET[0])


def decode_id(encoded: str) -> int:
    stripped = encoded.lstrip(ALPHABET[0])
    mixed = base62_decode(stripped)
    return (mixed - SALT_ADD) ^ SECRET_XOR

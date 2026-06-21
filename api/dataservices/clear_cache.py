from cache import redis_client

patterns = [
    "tutorials:*",
]

print("Clearing tutorials cache...\n")

total = 0
for p in patterns:
    c = 0
    for k in redis_client.scan_iter(match=p):
        redis_client.delete(k)
        c += 1
    total += c
    print(f"{p} → {c} keys")

print("\nDone. Total:", total)

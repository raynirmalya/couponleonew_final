from cache import redis_client


def invalidate_pattern(pattern):
    count = 0
    for key in redis_client.scan_iter(match=pattern):
        redis_client.delete(key)
        count += 1
    return count


def invalidate_library(library_id):
    invalidate_pattern("tutorials:libraries*")
    invalidate_pattern(f"tutorials:library:{library_id}*")
    invalidate_pattern(f"tutorials:library_full:{library_id}*")


def invalidate_lesson(lesson_id):
    invalidate_pattern(f"tutorials:lesson:{lesson_id}*")
    invalidate_pattern("tutorials:lessons*")

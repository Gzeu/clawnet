#!/bin/bash
# ClawNet CLI for Unix/Linux/macOS
# Uses redis-cli directly via Docker

REDIS_CONTAINER="clawnet-redis"

case "$1" in
    ping)
        docker exec $REDIS_CONTAINER redis-cli ping
        ;;
    stats)
        echo ""
        echo "=== ClawNet Stats ==="
        echo ""
        echo -n "Agents: "
        docker exec $REDIS_CONTAINER redis-cli scard clawnet:agents
        echo -n "Messages: "
        docker exec $REDIS_CONTAINER redis-cli xlen clawnet:messages
        echo ""
        ;;
    agent)
        case "$2" in
            list)
                echo ""
                echo "=== Registered Agents ==="
                docker exec $REDIS_CONTAINER redis-cli smembers clawnet:agents
                ;;
            find)
                echo ""
                echo "=== Agents with skill: $3 ==="
                docker exec $REDIS_CONTAINER redis-cli smembers "clawnet:skill:$3"
                ;;
            *)
                echo "Usage: clawnet agent list|find <skill>"
                ;;
        esac
        ;;
    memory)
        case "$2" in
            get)
                echo ""
                echo "=== Memory: $3 ==="
                docker exec $REDIS_CONTAINER redis-cli get "clawnet:memory:$3"
                ;;
            *)
                echo "Usage: clawnet memory get <key>"
                ;;
        esac
        ;;
    message)
        case "$2" in
            list)
                echo ""
                echo "=== Recent Messages ==="
                docker exec $REDIS_CONTAINER redis-cli xrange clawnet:messages - + ${3:-10}
                ;;
            *)
                echo "Usage: clawnet message list [count]"
                ;;
        esac
        ;;
    clear)
        echo "Clearing all ClawNet data..."
        docker exec $REDIS_CONTAINER redis-cli eval "return redis.call('del', unpack(redis.call('keys', 'clawnet:*')))" 0
        echo "Done."
        ;;
    help|*)
        echo ""
        echo "🦞 ClawNet CLI - Agent Mesh Management"
        echo ""
        echo "Usage:"
        echo "  clawnet ping                     Test Redis connection"
        echo "  clawnet stats                     Show mesh statistics"
        echo "  clawnet agent list                List all agents"
        echo "  clawnet agent find <skill>        Find agents by skill"
        echo "  clawnet memory get <key>          Get memory entry"
        echo "  clawnet message list [count]      List recent messages"
        echo "  clawnet clear                     Clear all data"
        echo ""
        ;;
esac
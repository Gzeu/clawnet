#!/bin/bash

# ClawNet Quick Start Script

set -e

echo "🦞 ClawNet - Agent Mesh Platform"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Parse arguments
ACTION=${1:-"start"}

case $ACTION in
    start)
        echo -e "${GREEN}Starting ClawNet...${NC}"
        
        # Check if .env exists
        if [! -f .env ]; then
            echo -e "${YELLOW}Creating .env from .env.example${NC}"
            cp .env.example .env
        fi
        
        # Start services
        docker-compose up -d
        
        echo ""
        echo -e "${GREEN}✅ ClawNet is running!${NC}"
        echo ""
        echo "Endpoints:"
        echo "  - API:          http://localhost:4000"
        echo "  - WebSocket:    ws://localhost:4000/ws"
        echo "  - Health:       http://localhost:4000/health"
        echo "  - Stats:        http://localhost:4000/api/v1/stats"
        echo ""
        echo "Commands:"
        echo "  ./start.sh stop      - Stop ClawNet"
        echo "  ./start.sh logs      - View logs"
        echo "  ./start.sh restart   - Restart ClawNet"
        echo "  ./start.sh status    - Check status"
        ;;
    
    stop)
        echo -e "${YELLOW}Stopping ClawNet...${NC}"
        docker-compose down
        echo -e "${GREEN}✅ ClawNet stopped${NC}"
        ;;
    
    restart)
        echo -e "${YELLOW}Restarting ClawNet...${NC}"
        docker-compose restart
        echo -e "${GREEN}✅ ClawNet restarted${NC}"
        ;;
    
    logs)
        docker-compose logs -f api
        ;;
    
    status)
        echo -e "${GREEN}ClawNet Status:${NC}"
        docker-compose ps
        echo ""
        echo -e "${GREEN}Health Check:${NC}"
        curl -s http://localhost:4000/health | jq . 2>/dev/null || curl -s http://localhost:4000/health
        ;;
    
    build)
        echo -e "${YELLOW}Building ClawNet...${NC}"
        docker-compose build
        echo -e "${GREEN}✅ Build complete${NC}"
        ;;
    
    clean)
        echo -e "${RED}Cleaning up...${NC}"
        docker-compose down -v
        echo -e "${GREEN}✅ Cleanup complete${NC}"
        ;;
    
    dev)
        echo -e "${GREEN}Starting in development mode...${NC}"
        
        # Check if pnpm is installed
        if ! command -v pnpm &> /dev/null; then
            echo -e "${RED}Error: pnpm is not installed${NC}"
            echo "Install pnpm: npm install -g pnpm"
            exit 1
        fi
        
        # Check if Redis is running
        if ! docker ps | grep -q redis; then
            echo -e "${YELLOW}Starting Redis...${NC}"
            docker run -d -p 6379:6379 --name clawnet-redis redis:alpine
        fi
        
        # Install dependencies
        echo -e "${YELLOW}Installing dependencies...${NC}"
        pnpm install
        
        # Build
        echo -e "${YELLOW}Building packages...${NC}"
        pnpm build
        
        # Start API server
        echo -e "${GREEN}Starting API server...${NC}"
        pnpm --filter @clawnet/api dev
        ;;
    
    *)
        echo "Usage: ./start.sh [command]"
        echo ""
        echo "Commands:"
        echo "  start     Start ClawNet (default)"
        echo "  stop      Stop ClawNet"
        echo "  restart   Restart ClawNet"
        echo "  logs      View API logs"
        echo "  status    Check status"
        echo "  build     Build Docker images"
        echo "  clean     Remove all containers and volumes"
        echo "  dev       Run in development mode (without Docker)"
        ;;
esac
.PHONY: dev down check test integration lambda

dev:
	npm run dev

down:
	npm run down

check:
	npm run build

test:
	npm test

integration:
	npm run test:integration

lambda:
	npm run build:lambda

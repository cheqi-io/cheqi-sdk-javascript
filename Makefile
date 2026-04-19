ENV ?= test

SPEC_LOCAL_URL := http://localhost:8080/v3/api-docs.yaml
SPEC_TEST_URL := https://test.api.cheqi.io/v3/api-docs.yaml
SPEC_SANDBOX_URL := https://sandbox.api.cheqi.io/v3/api-docs.yaml
SPEC_PROD_URL := https://api.cheqi.io/v3/api-docs.yaml

ifeq ($(ENV),local)
SPEC_URL := $(SPEC_LOCAL_URL)
else ifeq ($(ENV),test)
SPEC_URL := $(SPEC_TEST_URL)
else ifeq ($(ENV),sandbox)
SPEC_URL := $(SPEC_SANDBOX_URL)
else ifeq ($(ENV),prod)
SPEC_URL := $(SPEC_PROD_URL)
else
$(error Unsupported ENV '$(ENV)'. Use one of: local, test, sandbox, prod)
endif
GENERATED_DIR := src/models/generated

.PHONY: fetch-spec generate build test

fetch-spec:
	curl -fsSL $(SPEC_URL) -o openapi.yaml
	@echo "Spec updated. Run 'make generate' to regenerate models."

generate:
	rm -rf /tmp/cheqi-js-gen
	openapi-generator generate \
		-i openapi.yaml \
		-g typescript-fetch \
		-o /tmp/cheqi-js-gen \
		--global-property models,supportingFiles=runtime.ts \
		--model-package models.generated \
		--additional-properties=supportsES6=true,typescriptThreePlus=true,enumPropertyNaming=UPPERCASE,modelPropertyNaming=original
	rm -rf $(GENERATED_DIR)
	mkdir -p $(GENERATED_DIR)
	cp /tmp/cheqi-js-gen/models/*.ts $(GENERATED_DIR)/
	cp /tmp/cheqi-js-gen/runtime.ts $(GENERATED_DIR)/
	find $(GENERATED_DIR) -name '*.ts' -exec perl -pi -e "s|from '../runtime'|from './runtime'|g" {} +
	find $(GENERATED_DIR) -name '*.ts' -exec perl -pi -e "s|from '\./([^']+)'|from './\$$1.js'|g" {} +
	cd $(GENERATED_DIR) && for f in *.ts; do [ "$$f" = "index.ts" ] || [ "$$f" = "runtime.ts" ] && continue; echo "export * from './$$( echo $$f | sed 's/\.ts$$//' ).js';"; done > index.ts
	rm -rf /tmp/cheqi-js-gen
	@echo "Models generated in $(GENERATED_DIR)/"

build:
	npm run build

test:
	npm test

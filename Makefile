SPEC_URL ?= https://test.api.cheqi.io/v3/api-docs.yaml
LOCAL_SPEC_URL ?= http://localhost:8080/openapi/yaml
GENERATED_DIR := src/models/generated

.PHONY: fetch-spec fetch-spec-local generate build test

fetch-spec:
	curl -fsSL $(SPEC_URL) -o openapi.yaml
	@echo "Spec updated. Run 'make generate' to regenerate models."

fetch-spec-local:
	curl -fsSL $(LOCAL_SPEC_URL) -o openapi.yaml
	@echo "Local spec updated from $(LOCAL_SPEC_URL). Run 'make generate' to regenerate models."

generate:
	rm -rf /tmp/cheqi-js-gen
	python3 -c "\
	import yaml; \
	d=yaml.safe_load(open('openapi.yaml')); \
	schemas=d.get('components',{}).get('schemas',{}); \
	[s.update({'enum': list(dict.fromkeys(s['enum']))}) for s in \
	 [schemas.get(n,{}) for n in schemas] + \
	 [schemas.get(n,{}).get('properties',{}).get(p,{}) \
	  for n in schemas for p in schemas.get(n,{}).get('properties',{})] \
	 if 'enum' in s and len(s['enum']) != len(set(s['enum']))]; \
	yaml.dump(d, open('/tmp/cheqi-openapi-deduped.yaml','w'), default_flow_style=False, sort_keys=False)"
	openapi-generator generate \
		-i /tmp/cheqi-openapi-deduped.yaml \
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
	rm -rf /tmp/cheqi-js-gen /tmp/cheqi-openapi-deduped.yaml
	@echo "Models generated in $(GENERATED_DIR)/"

build:
	npm run build

test:
	npm test

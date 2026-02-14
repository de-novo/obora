1092 |     const provider = s.providers[providerID]
1093 |     if (!provider) {
1094 |       const availableProviders = Object.keys(s.providers)
1095 |       const matches = fuzzysort.go(providerID, availableProviders, { limit: 3, threshold: -10000 })
1096 |       const suggestions = matches.map((m) => m.target)
1097 |       throw new ModelNotFoundError({ providerID, modelID, suggestions })
                   ^
ProviderModelNotFoundError: ProviderModelNotFoundError
 data: {
  providerID: "zai",
  modelID: "glm-4.7",
  suggestions: [ "zai-coding-plan" ],
},

      at getModel (src/provider/provider.ts:1097:13)

[91m[1mError: [0mModel not found: zai/glm-4.7. Did you mean: zai-coding-plan?

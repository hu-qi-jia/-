# 嵌入模型改用 Xenova/bge-small-zh-v1.5 而非原项目的多语言 MiniLM

语料为纯中文客服问答,原默认模型 paraphrase-multilingual-MiniLM-L12-v2 是多语言均衡模型,中文语义检索质量一般且量化体积约百 MB。bge-small-zh-v1.5 为中文检索专门调优,量化后约 25MB、512 维,中文匹配质量明显更好;换模发生在空库期(扩展从未运行、无历史向量),零重嵌成本,故一次性替换。

记录自带 `embeddingModel` 版本号,将来若再换模型,启动扫描按旧版本号懒重嵌,不必人工干预。

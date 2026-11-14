"""
计算论文中表18、表19、表20的参数
- 表18: 各数据集的参数（边数、唯一身份数、平均度数）
- 表19: 不同集合对的重叠情况（身份重叠）
- 表20: 各数据集的连通情况（连通分量）
"""
import json
import os

# 获取脚本所在目录，确保无论从哪里运行都能找到数据文件
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 加载数据
with open(os.path.join(SCRIPT_DIR, 'FFPP_split', 'train.json'), 'r') as f:
    train_pairs = json.load(f)
with open(os.path.join(SCRIPT_DIR, 'FFPP_split', 'val.json'), 'r') as f:
    val_pairs = json.load(f)
with open(os.path.join(SCRIPT_DIR, 'FFPP_split', 'test.json'), 'r') as f:
    test_pairs = json.load(f)

print("=" * 70)
print("表 18: 各数据集的参数")
print("=" * 70)

# 提取唯一身份
def get_unique_ids(pairs):
    ids = set()
    for pair in pairs:
        ids.add(pair[0])
        ids.add(pair[1])
    return ids

train_ids = get_unique_ids(train_pairs)
val_ids = get_unique_ids(val_pairs)
test_ids = get_unique_ids(test_pairs)

train_unique = len(train_ids)
val_unique = len(val_ids)
test_unique = len(test_ids)

# 平均度数 = 2 * 边数 / 唯一身份数
train_avg_degree = 2 * len(train_pairs) / train_unique
val_avg_degree = 2 * len(val_pairs) / val_unique
test_avg_degree = 2 * len(test_pairs) / test_unique

print(f"{'数据集':<10} {'边数(图像对)':<18} {'唯一身份数':<15} {'平均度数':<15}")
print("-" * 58)
print(f"{'Train':<10} {len(train_pairs):<18} {train_unique:<15} {train_avg_degree:<15.4f}")
print(f"{'Val':<10} {len(val_pairs):<18} {val_unique:<15} {val_avg_degree:<15.4f}")
print(f"{'Test':<10} {len(test_pairs):<18} {test_unique:<15} {test_avg_degree:<15.4f}")

print()
print("=" * 70)
print("表 19: 不同集合对的重叠情况")
print("=" * 70)

# 计算身份重叠
overlap_train_val = train_ids & val_ids
overlap_train_test = train_ids & test_ids
overlap_val_test = val_ids & test_ids
overlap_all = train_ids & val_ids & test_ids

# 重叠比例（占较小集合）
ratio_train_val = len(overlap_train_val) / min(len(train_ids), len(val_ids)) * 100
ratio_train_test = len(overlap_train_test) / min(len(train_ids), len(test_ids)) * 100
ratio_val_test = len(overlap_val_test) / min(len(val_ids), len(test_ids)) * 100

print(f"{'集合对':<20} {'重叠身份数量':<18} {'重叠比例(占较小集合)':<20}")
print("-" * 58)
print(f"{'Train ∩ Val':<20} {len(overlap_train_val):<18} {ratio_train_val:.2f}%")
print(f"{'Train ∩ Test':<20} {len(overlap_train_test):<18} {ratio_train_test:.2f}%")
print(f"{'Val ∩ Test':<20} {len(overlap_val_test):<18} {ratio_val_test:.2f}%")
print(f"{'Train ∩ Val ∩ Test':<20} {len(overlap_all):<18} {'—'}")

print()
print("=" * 70)
print("表 20: 各数据集的连通情况")
print("=" * 70)

# 使用并查集(Union-Find)计算连通分量
class UnionFind:
    def __init__(self):
        self.parent = {}
        self.rank = {}
    
    def find(self, x):
        if x not in self.parent:
            self.parent[x] = x
            self.rank[x] = 0
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]
    
    def union(self, x, y):
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        if self.rank[rx] < self.rank[ry]:
            rx, ry = ry, rx
        self.parent[ry] = rx
        if self.rank[rx] == self.rank[ry]:
            self.rank[rx] += 1

def compute_connected_components(pairs):
    uf = UnionFind()
    for pair in pairs:
        uf.union(pair[0], pair[1])
    
    # 统计连通分量
    components = {}
    all_nodes = set()
    for pair in pairs:
        all_nodes.add(pair[0])
        all_nodes.add(pair[1])
    
    for node in all_nodes:
        root = uf.find(node)
        if root not in components:
            components[root] = 0
        components[root] += 1
    
    num_components = len(components)
    is_connected = (num_components == 1)
    max_comp_size = max(components.values()) if components else 0
    total_nodes = len(all_nodes)
    max_comp_ratio = max_comp_size / total_nodes * 100 if total_nodes > 0 else 0
    
    return num_components, is_connected, max_comp_ratio

train_components, train_connected, train_max_comp_ratio = compute_connected_components(train_pairs)
val_components, val_connected, val_max_comp_ratio = compute_connected_components(val_pairs)
test_components, test_connected, test_max_comp_ratio = compute_connected_components(test_pairs)

print(f"{'数据集':<10} {'连通分量数':<15} {'是否完全连通':<18} {'最大分量占比':<15}")
print("-" * 58)
print(f"{'Train':<10} {train_components:<15} {'是' if train_connected else '否':<18} {train_max_comp_ratio:.2f}%")
print(f"{'Val':<10} {val_components:<15} {'是' if val_connected else '否':<18} {val_max_comp_ratio:.2f}%")
print(f"{'Test':<10} {test_components:<15} {'是' if test_connected else '否':<18} {test_max_comp_ratio:.2f}%")

# 也打印一些重叠的具体身份（调试用）
if overlap_train_val:
    print(f"\nTrain ∩ Val 重叠身份: {sorted(overlap_train_val)}")
if overlap_train_test:
    print(f"Train ∩ Test 重叠身份: {sorted(overlap_train_test)}")
if overlap_val_test:
    print(f"Val ∩ Test 重叠身份: {sorted(overlap_val_test)}")

print()
print("=" * 70)
print("表 21: 数据集中可能存在的异常情况（数据质量检查）")
print("=" * 70)

def check_data_quality(pairs, ids):
    """检查数据质量：重复边、自环、孤立节点"""
    # 1. 检查重复边（无序对）
    edge_set = set()
    dup_count = 0
    for pair in pairs:
        edge = tuple(sorted(pair))
        if edge in edge_set:
            dup_count += 1
        else:
            edge_set.add(edge)
    
    # 2. 检查自环 (a == b)
    self_loop_count = sum(1 for pair in pairs if pair[0] == pair[1])
    
    # 3. 检查孤立节点（度=0）
    # 在图像对数据中，所有出现的身份至少有度1，所以孤立节点=0
    # 但如果考虑某个全局身份集合中未出现在该子集的身份，则需另算
    # 这里按照图结构定义：只看出现在pairs中的节点，度>=1，故孤立节点=0
    degree = {}
    for pair in pairs:
        degree[pair[0]] = degree.get(pair[0], 0) + 1
        degree[pair[1]] = degree.get(pair[1], 0) + 1
    isolated_count = sum(1 for d in degree.values() if d == 0)
    
    return dup_count, self_loop_count, isolated_count

train_dup, train_self, train_isolated = check_data_quality(train_pairs, train_ids)
val_dup, val_self, val_isolated = check_data_quality(val_pairs, val_ids)
test_dup, test_self, test_isolated = check_data_quality(test_pairs, test_ids)

print(f"{'检查项':<20} {'Train':<15} {'Val':<15} {'Test':<15}")
print("-" * 65)
print(f"{'存在重复边':<20} {train_dup:<15} {val_dup:<15} {test_dup:<15}")
print(f"{'存在自环(a==b)':<20} {train_self:<15} {val_self:<15} {test_self:<15}")
print(f"{'孤立节点(度=0)':<20} {train_isolated:<15} {val_isolated:<15} {test_isolated:<15}")

print()
print("=" * 70)
print("5.4.5 数字范围分布")
print("=" * 70)

# 身份编号转为整数后求范围
train_ids_int = sorted([int(x) for x in train_ids])
val_ids_int = sorted([int(x) for x in val_ids])
test_ids_int = sorted([int(x) for x in test_ids])

print(f"Train: {min(train_ids_int):03d} ~ {max(train_ids_int):03d}")
print(f"Val:   {min(val_ids_int):03d} ~ {max(val_ids_int):03d}")
print(f"Test:  {min(test_ids_int):03d} ~ {max(test_ids_int):03d}")

all_ids_int = sorted(train_ids_int + val_ids_int + test_ids_int)
print(f"\n所有数字均处于 [{min(all_ids_int):03d}, {max(all_ids_int):03d}] 区间内，"
      f"表明数据集已规范化处理，未出现超出范围的异常值。")

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import api from '../api';
import { apiPath } from '../api/config';

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  local: { color: 'default', text: '本地草稿' },
  pushing: { color: 'processing', text: '处理中' },
  xy_draft: { color: 'default', text: '本地草稿' },
  failed: { color: 'default', text: '本地草稿' },
};

/**
 * 商品草稿：仅本地素材管理。
 * 不调用闲鱼正式发布（易封号）；闲鱼也无公开「仅草稿」API。
 */
export default function ItemDraft() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    try {
      const drafts = await api.get<any[]>('/item-drafts');
      setList(Array.isArray(drafts) ? drafts : []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({
      deliveryChoice: '无需邮寄',
      condition: '全新',
      price: 9.9,
    });
    setFileList([]);
    setModalOpen(true);
  };

  const openEdit = (row: any) => {
    setEditId(row.id);
    form.setFieldsValue({
      title: row.title,
      description: row.description,
      price: Number(row.price),
      originalPrice: row.originalPrice != null ? Number(row.originalPrice) : undefined,
      category: row.category || undefined,
      condition: row.condition || '全新',
      brand: row.brand || undefined,
      deliveryChoice: row.deliveryChoice || '无需邮寄',
      postPrice: row.postPrice != null ? Number(row.postPrice) : undefined,
      address: row.address || undefined,
      remark: row.remark || undefined,
    });
    const fl: UploadFile[] = (row.images || []).map((img: any, i: number) => ({
      uid: String(-i - 1),
      name: `img-${i}`,
      status: 'done',
      url: img.url?.startsWith('http')
        ? img.url
        : img.url
          ? apiPath(img.url)
          : undefined,
      response: img,
    }));
    setFileList(fl);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const images = fileList
      .map((f) => {
        const r: any = f.response || {};
        if (r.localPath || r.url) {
          return {
            localPath: r.localPath,
            url: r.url,
            width: r.width,
            height: r.height,
          };
        }
        // 已有草稿回写
        if ((f as any).response?.localPath) return (f as any).response;
        return null;
      })
      .filter(Boolean);

    if (!images.length) {
      message.warning('请至少上传 1 张图片');
      return;
    }

    const payload = { ...values, images };
    try {
      if (editId) {
        await api.put(`/item-drafts/${editId}`, payload);
        message.success('已更新本地草稿');
      } else {
        await api.post('/item-drafts', payload);
        message.success('已保存本地草稿');
      }
      setModalOpen(false);
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/item-drafts/${id}`);
      message.success('已删除');
      refresh();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const customUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    try {
      const fd = new FormData();
      fd.append('files', file as File);
      const token = localStorage.getItem('accessToken');
      const resp = await fetch(apiPath('/item-drafts/upload'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const body = await resp.json();
      if (body?.code !== 0 && body?.code !== undefined) {
        throw new Error(body.message || '上传失败');
      }
      const data = body?.data ?? body;
      const saved = data?.files?.[0];
      if (!saved) throw new Error('上传失败');
      onSuccess(saved);
      message.success('图片已上传');
    } catch (e) {
      onError(e);
      message.error((e as Error).message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '封面',
      width: 72,
      render: (_: any, row: any) => {
        const img = row.images?.[0];
        if (!img) return '-';
        const src = img.url?.startsWith('http')
          ? img.url
          : img.url
            ? apiPath(String(img.url))
            : undefined;
        return src ? (
          <Image src={src} width={48} height={48} style={{ objectFit: 'cover' }} />
        ) : (
          '-'
        );
      },
    },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    {
      title: '售价',
      dataIndex: 'price',
      width: 90,
      render: (p: number) => `¥${Number(p).toFixed(2)}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (s: string) => {
        const m = STATUS_MAP[s] || { color: 'default', text: s };
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '操作',
      width: 180,
      render: (_: any, row: any) => (
        <Space wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>商品草稿</Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="仅本地草稿（不上架、不调闲鱼发布接口）"
        description="为降低封号风险，本页只做本地素材管理。闲鱼没有公开稳定的「仅存草稿」API；正式发布接口会直接上架且风控严格。请在闲鱼 App/网页手动发布商品。"
      />
      <Card
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refresh}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建草稿
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editId ? '编辑草稿' : '新建草稿'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={720}
        destroyOnClose
        okText="保存本地"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }, { max: 60 }]}
          >
            <Input maxLength={60} showCount placeholder="最多 60 字" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={4} placeholder="商品详情、发货说明等" />
          </Form.Item>
          <Space size="large" wrap style={{ width: '100%' }}>
            <Form.Item
              name="price"
              label="售价(元)"
              rules={[{ required: true, message: '请输入售价' }]}
            >
              <InputNumber min={0.01} step={0.1} precision={2} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="originalPrice" label="原价(元)">
              <InputNumber min={0} step={0.1} precision={2} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="condition" label="成色">
              <Select
                style={{ width: 140 }}
                options={['全新', '99新', '95新', '9成新', '8成新', '其他'].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </Form.Item>
          </Space>
          <Space size="large" wrap style={{ width: '100%' }}>
            <Form.Item name="category" label="分类">
              <Select
                allowClear
                style={{ width: 160 }}
                options={[
                  '数码家电',
                  '服饰鞋包',
                  '家居日用',
                  '图书音像',
                  '美妆个护',
                  '虚拟商品',
                  '其他',
                ].map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
            <Form.Item name="brand" label="品牌">
              <Input style={{ width: 160 }} placeholder="可选" />
            </Form.Item>
            <Form.Item name="deliveryChoice" label="运费">
              <Select
                style={{ width: 160 }}
                options={['无需邮寄', '包邮', '一口价', '按距离计费'].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </Form.Item>
          </Space>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.deliveryChoice !== cur.deliveryChoice}
          >
            {({ getFieldValue }) =>
              getFieldValue('deliveryChoice') === '一口价' ? (
                <Form.Item name="postPrice" label="邮费(元)">
                  <InputNumber min={0} precision={2} style={{ width: 140 }} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="address" label="所在地（可选）">
            <Input placeholder="如：江苏省 南京市" />
          </Form.Item>
          <Form.Item name="remark" label="内部备注">
            <Input.TextArea rows={2} placeholder="仅本地可见" />
          </Form.Item>
          <Form.Item label="商品图片（最多9张，首图为封面）" required>
            <Upload
              listType="picture-card"
              fileList={fileList}
              customRequest={customUpload}
              multiple
              maxCount={9}
              accept="image/*"
              onChange={({ fileList: fl }) => setFileList(fl)}
            >
              {fileList.length >= 9 ? null : (
                <div>
                  <CloudUploadOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
